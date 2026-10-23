"""질문 → 검색 → (참조 따라가기) → LLM 답변. RAG 전체 흐름을 한 번에 실행한다.

실행: python scripts/answer.py "연차 며칠이야?"
"""
import re
import sys
from datetime import date

from rag_common import Supabase, generate, load_env
from search import search

TOP_K = 5

# 참조를 따라갈 때 살펴볼 상위 검색 결과 수와, 추가로 가져올 최대 조각 수
REF_SCAN_TOP = 3
REF_LIMIT = 3

REGULATIONS = [
    "인사규정", "근무규정", "휴가규정", "보수규정", "복리후생규정", "출장 및 여비규정",
    "경비 및 법인카드 규정", "정보보안규정", "교육 및 자기계발 규정", "상벌 및 징계규정", "위임전결규정", "부칙",
]
# "별표 9", "휴가규정 제11조", "부칙 제3조" 같은 참조를 찾는다.
REFERENCE = re.compile(r"별표 \d+|(?:" + "|".join(map(re.escape, REGULATIONS)) + r") 제\d+조")

SYSTEM_PROMPT = """너는 주식회사 밋파송(Mithpasong)의 사내 규정 안내 도우미다.

규칙:
1. 규정 내용(금액, 일수, 기한, 대상, 결재권자, 절차 등)은 반드시 [참고 자료]만 근거로 답한다. 일반 상식이나 법률 지식으로 규정을 보충하지 않으며, 자료와 일반 상식이 다르면 자료를 따른다. 다만 지명이 어느 행정구역(예: 부산은 광역시)이나 국가에 속하는지 같은 일반적인 사실은 상식으로 판단해도 된다.
2. 자료에서 답을 찾을 수 없으면 추측하지 말고 "규정집에서 해당 내용을 찾을 수 없습니다."라고 답한 뒤, People팀(#ask-people)에 문의하라고 안내한다.
3. 부서, 직급, 조건에 따른 예외가 있으면 함께 알려준다.
4. 신구조문 대비표의 "종전" 값은 현재 효력이 없다. 시행 예정인 개정은 오늘 날짜와 시행일을 비교해 지금 적용되는지 구분해서 알려준다.
5. 계산이 필요하면 계산 과정을 한 줄로 보여준다.
6. 자료가 "별표 N에 따른다"처럼 다른 자료를 가리키면, [참조 자료]에서 그 내용을 찾아 구체적으로 답한다.
7. 존댓말로 3~6문장 이내로 간결하게 답한다.
8. 마지막 줄에 근거를 "출처: 휴가규정 제2조, 별표 1" 형식으로 적는다."""


def follow_references(hits: list[dict], env: dict) -> list[dict]:
    """상위 검색 결과가 가리키는 별표·조문 중 아직 없는 것을 DB에서 가져온다."""
    have = {h["metadata"]["ref"] for h in hits}
    wanted = []
    for hit in hits[:REF_SCAN_TOP]:
        body = hit["content"].split("\n", 1)[-1]  # 첫 줄(조각 제목)은 자기 자신을 가리키므로 뺀다.
        for ref in REFERENCE.findall(body):
            if ref not in have and ref not in wanted:
                wanted.append(ref)
    wanted = wanted[:REF_LIMIT]
    if not wanted:
        return []
    rows = Supabase(env).select_by_refs("chunks", wanted)
    return sorted(rows, key=lambda r: wanted.index(r["metadata"]["ref"]))


def format_block(label: str, chunk: dict) -> str:
    meta = chunk["metadata"]
    pages = ",".join(map(str, meta["pages"]))
    return f"[{label}] ({meta['ref']}, p.{pages})\n{chunk['content']}"


def build_prompt(question: str, hits: list[dict], refs: list[dict]) -> str:
    blocks = [format_block(f"자료 {i}", h) for i, h in enumerate(hits, start=1)]
    blocks += [format_block(f"참조 자료 {i}", r) for i, r in enumerate(refs, start=1)]
    context = "\n\n".join(blocks)
    return f"오늘 날짜: {date.today().isoformat()}\n\n[참고 자료]\n{context}\n\n[질문]\n{question}"


def answer(question: str, env: dict) -> dict:
    hits = search(question, env, TOP_K)
    refs = follow_references(hits, env)
    text = generate(build_prompt(question, hits, refs), SYSTEM_PROMPT, env["GEMINI_API_KEY"])
    return {
        "answer": text,
        "retrieved": [h["metadata"]["ref"] for h in hits],
        "followed": [r["metadata"]["ref"] for r in refs],
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    question = " ".join(sys.argv[1:]) or "연차 며칠이야?"
    result = answer(question, load_env())
    print(f"질문: {question}\n")
    print(result["answer"])
    print(f"\n(검색된 조각: {', '.join(result['retrieved'])})")
    if result["followed"]:
        print(f"(참조로 함께 가져온 조각: {', '.join(result['followed'])})")


if __name__ == "__main__":
    main()
