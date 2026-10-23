"""PDF 사내 규정집에서 글자와 표를 꺼내 검색용 조각(JSONL)으로 만든다.

실행: python scripts/build_chunks.py
입력: data/raw/mithpasong-handbook.pdf
출력: data/processed/chunks.jsonl  (임베딩할 조각)
      data/processed/handbook.md    (추출 결과를 사람이 확인하는 용도)
"""
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

PDF_PATH = Path("data/raw/mithpasong-handbook.pdf")
OUT_DIR = Path("data/processed")
DOC_TITLE = "Mithpasong 사내 규정집 v4.2"

# 조각 하나의 최대 글자 수. 이보다 긴 조문이나 표는 나눈다.
MAX_CHARS = 1200

# 이 영역 밖의 글자는 머리말/꼬리말(문서 이름, 쪽 번호)이라 버린다. (단위: pt)
BODY_TOP = 45
BODY_BOTTOM = 800

# 같은 문단 안의 줄 간격은 약 16.5pt, 문단 사이는 18.8pt 이상이다.
PARA_GAP = 17.5

# 새 문단의 시작으로 보는 패턴: ① 항, 1. 호, 가. 목, ※ 주석, 조문 제목
ITEM_START = re.compile(r"^([①-⑳]|\d+\.\s|[가-하]\.\s|※|\(예시\)|제\d+조(의\d+)?\()")
ARTICLE_TITLE = re.compile(r"^(제\d+조(?:의\d+)?)\((.+)\)$")
APPENDIX_TABLE = re.compile(r"^\[(별표 \d+)\]")
APPENDIX_DOC = re.compile(r"^(부록 [A-Z])\.")


@dataclass
class Element:
    kind: str  # part | section | subheading | article | para | table
    page: int
    y: float
    text: str = ""
    rows: list = field(default_factory=list)


def join_wrapped(left: str, right: str) -> str:
    """줄바꿈으로 끊긴 두 줄을 잇는다.

    한글은 단어 중간에서도 줄이 바뀌므로 기본은 붙여 쓴다.
    앞 줄이 문장부호로 끝나거나 뒷줄이 숫자·영문·괄호로 시작하면 띄어 쓴다.
    """
    if not left:
        return right
    if re.search(r"[,.)」\"'?:]$", left) or re.match(r"[(「\"'0-9A-Za-z]", right):
        return f"{left} {right}"
    return left + right


def clean_cell(cell) -> str | None:
    """셀 안의 줄바꿈을 잇는다. 병합된 칸(None)과 진짜 빈칸('')은 구분해서 그대로 둔다."""
    if cell is None:
        return None
    text = ""
    for part in str(cell).split("\n"):
        text = join_wrapped(text, part.strip())
    return text.strip()


def is_heading_box(table) -> bool:
    """배경색 상자로 꾸민 규정 제목을 표로 잘못 인식한 경우를 걸러낸다."""
    rows = table.extract()
    return len(rows) == 1 and not (rows[0][0] or "").strip()


def classify(size: float, bold: bool, text: str) -> str:
    if size >= 16:
        return "part"
    if size >= 13:
        return "section"
    if bold and size >= 10.5:
        return "subheading"
    if bold and ARTICLE_TITLE.match(text):
        return "article"
    return "para"


def extract_page(page, pno: int) -> list[Element]:
    tables = [t for t in page.find_tables().tables if not is_heading_box(t)]
    table_boxes = [pymupdf.Rect(t.bbox) for t in tables]

    # 글자 줄 모으기 (머리말/꼬리말, 표 안의 글자는 제외)
    raw_lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            x0, y0, x1, y1 = line["bbox"]
            center = pymupdf.Point((x0 + x1) / 2, (y0 + y1) / 2)
            if not text or y0 < BODY_TOP or y0 > BODY_BOTTOM:
                continue
            if any(box.contains(center) for box in table_boxes):
                continue
            span = line["spans"][0]
            raw_lines.append((y0, x0, text, span["size"], bool(span["flags"] & 16)))

    # 같은 높이에 있는 줄은 한 줄로 합친다. (예: 표지의 "문서 버전   v4.2")
    raw_lines.sort(key=lambda l: (round(l[0]), l[1]))
    lines = []
    for y, x, text, size, bold in raw_lines:
        if lines and abs(lines[-1][0] - y) < 2:
            prev = lines[-1]
            lines[-1] = (prev[0], f"{prev[1]} {text}", prev[2], prev[3])
        else:
            lines.append((y, text, size, bold))

    items = [("line", l[0], l) for l in lines]
    items += [("table", t.bbox[1], t) for t in tables]
    items.sort(key=lambda item: item[1])

    elements: list[Element] = []
    last_y = None
    for kind, y, obj in items:
        if kind == "table":
            rows = [[clean_cell(c) for c in row] for row in obj.extract()]
            elements.append(Element("table", pno, y, rows=rows))
            last_y = None
            continue

        _, text, size, bold = obj
        role = "para" if pno == 0 else classify(size, bold, text)
        prev = elements[-1] if elements else None

        # 긴 제목이 두 줄로 나뉜 경우 (예: "[별표 8] ... 관" + "련)")
        if role == "section" and prev is not None and prev.kind == "section" and y - last_y < 25:
            prev.text = join_wrapped(prev.text, text)
            last_y = y
            continue

        continues = (
            role == "para"
            and prev is not None
            and prev.kind == "para"
            and last_y is not None
            and y - last_y < PARA_GAP
            and not ITEM_START.match(text)
        )
        if continues:
            prev.text = join_wrapped(prev.text, text)
        else:
            elements.append(Element(role, pno, y, text=text))
        last_y = y
    return elements


def merge_across_pages(elements: list[Element]) -> list[Element]:
    """페이지 경계에서 잘린 표와 문단을 다시 잇는다."""
    merged: list[Element] = []
    for el in elements:
        prev = merged[-1] if merged else None
        next_page = prev is not None and el.page == prev.page + 1

        if next_page and el.kind == prev.kind == "table" and len(el.rows[0]) == len(prev.rows[0]):
            # 다음 페이지의 표에 제목 줄이 없으면 앞 표의 제목 줄을 그대로 쓴다.
            body = el.rows[1:] if el.rows[0] == prev.rows[0] else el.rows
            prev.rows.extend(body)
            continue

        if (
            next_page
            and el.kind == prev.kind == "para"
            and not ITEM_START.match(el.text)
            and not prev.text.endswith((".", "다", ")"))
        ):
            prev.text = join_wrapped(prev.text, el.text)
            continue

        merged.append(el)

    # 세로로 병합된 칸은 아래 줄이 비어 있으므로 위 값으로 채운다. (예: 별표 2의 "사망")
    for el in merged:
        if el.kind == "table":
            for i in range(1, len(el.rows)):
                if not el.rows[i][0] and el.rows[i - 1][0]:
                    el.rows[i][0] = el.rows[i - 1][0]
    return merged


def table_to_lines(rows: list[list[str | None]]) -> list[str]:
    """표의 각 행을 "제목: 값 | 제목: 값" 문장으로 바꾼다. 행 하나만 봐도 뜻이 통하게 하려는 것이다."""
    header, *body = rows
    header = [h or "" for h in header]
    lines = []
    for row in body:
        pairs = []
        for j, (h, v) in enumerate(zip(header, row)):
            if not v:
                continue
            # 오른쪽 칸들과 병합된 셀은 특정 열 제목에 속하지 않으므로 제목 없이 값만 적는다.
            spans_right = j > 0 and j + 1 < len(row) and row[j + 1] is None
            pairs.append(v if spans_right else f"{h}: {v}")
        lines.append("- " + " | ".join(pairs))
    return lines


@dataclass
class Group:
    ref: str  # 평가 데이터의 sources와 같은 형식 (예: "휴가규정 제2조", "별표 6")
    heading: str  # 조각 맨 앞에 붙는 제목
    kind: str  # article | appendix | front
    section: str
    units: list = field(default_factory=list)  # (글, 페이지)
    notes: list = field(default_factory=list)  # 별표의 ※ 주석 (나뉜 조각마다 반복)


def build_groups(elements: list[Element]) -> list[Group]:
    groups: list[Group] = []
    section = "표지"
    current = Group("표지", "표지 및 문서 정보", "front", section)
    groups.append(current)

    def start(ref, heading, kind):
        nonlocal current
        current = Group(ref, heading, kind, section)
        groups.append(current)

    for el in elements:
        if el.kind == "part":
            if el.text == "부칙":
                section = "부칙"
            continue

        if el.kind == "section":
            section = el.text
            if m := APPENDIX_TABLE.match(el.text):
                start(m.group(1), el.text, "appendix")
            elif m := APPENDIX_DOC.match(el.text):
                start(m.group(1), el.text, "appendix")
            else:
                start(el.text, el.text, "front" if el.text == "목차" else "article")
            continue

        if el.kind == "article":
            no, title = ARTICLE_TITLE.match(el.text).groups()
            start(f"{section} {no}", f"{section} {no}({title})", "article")
            continue

        if el.kind == "table":
            for line in table_to_lines(el.rows):
                current.units.append((line, el.page))
            continue

        # para, subheading
        if current.kind == "appendix" and el.text.startswith("※"):
            current.notes.append((el.text, el.page))
        else:
            current.units.append((el.text, el.page))

    return [g for g in groups if g.units or g.notes]


def split_long(text: str, budget: int) -> list[str]:
    if len(text) <= budget:
        return [text]
    return [text[i : i + budget] for i in range(0, len(text), budget)]


def build_chunks(groups: list[Group]) -> list[dict]:
    chunks = []
    for g in groups:
        header = f"[{DOC_TITLE}] {g.heading}"
        notes_text = "\n".join(t for t, _ in g.notes)
        budget = MAX_CHARS - len(header) - len(notes_text) - 2

        packs, current, size = [], [], 0
        for text, page in g.units:
            for piece in split_long(text, budget):
                if current and size + len(piece) + 1 > budget:
                    packs.append(current)
                    current, size = [], 0
                current.append((piece, page))
                size += len(piece) + 1
        if current or g.notes:
            packs.append(current)

        for i, pack in enumerate(packs, start=1):
            body = "\n".join(t for t, _ in pack)
            text = "\n".join(part for part in (header, body, notes_text) if part)
            pages = sorted({p + 1 for _, p in pack + g.notes})
            chunks.append(
                {
                    "id": f"{g.ref.replace(' ', '-')}-{i}",
                    "text": text,
                    "metadata": {
                        "ref": g.ref,
                        "section": g.section,
                        "heading": g.heading,
                        "kind": g.kind,
                        "part": f"{i}/{len(packs)}" if len(packs) > 1 else None,
                        "pages": pages,
                        "source": PDF_PATH.name,
                    },
                }
            )
    return chunks


def to_markdown(elements: list[Element]) -> str:
    out = []
    for el in elements:
        if el.kind == "part":
            out.append(f"\n# {el.text}")
        elif el.kind == "section":
            out.append(f"\n## {el.text}")
        elif el.kind in ("subheading", "article"):
            out.append(f"\n### {el.text}")
        elif el.kind == "table":
            header, *body = [[c or "" for c in row] for row in el.rows]
            out.append("| " + " | ".join(header) + " |")
            out.append("|" + "---|" * len(header))
            out.extend("| " + " | ".join(row) + " |" for row in body)
        else:
            out.append(el.text)
    return "\n".join(out).strip() + "\n"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    doc = pymupdf.open(PDF_PATH)

    elements = []
    for pno, page in enumerate(doc):
        elements.extend(extract_page(page, pno))
    elements = merge_across_pages(elements)

    chunks = build_chunks(build_groups(elements))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "handbook.md").write_text(to_markdown(elements), encoding="utf-8")
    with open(OUT_DIR / "chunks.jsonl", "w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    lengths = [len(c["text"]) for c in chunks]
    print(f"페이지 {doc.page_count}개 → 조각 {len(chunks)}개 (평균 {sum(lengths) // len(lengths)}자, 최대 {max(lengths)}자)")
    print(f"저장: {OUT_DIR / 'chunks.jsonl'}, {OUT_DIR / 'handbook.md'}")


if __name__ == "__main__":
    main()
