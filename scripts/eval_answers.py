"""테스트 질문으로 RAG 최종 답변을 채점한다.

실행: python scripts/eval_answers.py            (전체 50문제, 이미 푼 문제는 건너뜀)
      python scripts/eval_answers.py q14 q30    (일부 문제만 다시 풀기)
      python scripts/eval_answers.py --fresh    (처음부터 다시 풀기)
      python scripts/eval_answers.py --regrade  (API 호출 없이 저장된 답변만 다시 채점)

한 문제를 풀 때마다 결과를 바로 저장하므로, 무료 한도에 걸려 멈춰도 다음에 이어서 풀 수 있다.

채점 기준
- 답이 있는 질문: must_include 의 키워드가 모두 답변에 있으면 정답. (안쪽 배열은 "그중 하나")
- 규정에 없는 질문: "찾을 수 없" 이라고 답하면 정답.
- 출처 일치: 답변의 "출처:" 줄에 정답 근거(sources) 중 하나라도 있으면 일치.
키워드 채점은 빠르고 단순하지만, "실장이 아니라 팀장"처럼 키워드만 들어간 오답도 정답으로 볼 수 있다.
"""
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

from answer import answer
from rag_common import CHAT_MODEL, load_env

QUESTIONS_PATH = Path("data/eval/questions.jsonl")
# 모델별로 따로 저장해서 나중에 모델끼리 점수를 비교할 수 있게 한다.
RESULTS_PATH = Path(f"data/eval/answer_results.{CHAT_MODEL}.jsonl")
REFUSAL = "찾을 수 없"
REQUEST_INTERVAL = 0  # 질문 사이에 쉬는 시간(초). 무료 키라면 3 정도로 늘려 분당 한도를 피한다.


def with_variants(text: str) -> str:
    """같은 뜻의 다른 표기를 덧붙여서 키워드 비교가 표기 차이로 틀리지 않게 한다.

    예) "40,000원" → "4만원"도 있는 것으로 본다. "20영업일" → "20일"도 있는 것으로 본다.
    """
    variants = []
    for m in re.finditer(r"(\d{1,3}(?:,\d{3})+|\d+)\s?원", text):
        value = int(m.group(1).replace(",", ""))
        if value >= 10000 and value % 10000 == 0:
            man = value // 10000
            variants.append(f"{man}만원 {man:,}만원")
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s?(영업일|달력일)", text):
        variants.append(f"{m.group(1)}일")
    return text + "\n" + " ".join(variants)


def grade(q: dict, text: str) -> tuple[bool, list[str]]:
    if not q["answerable"]:
        return REFUSAL in text, [] if REFUSAL in text else ["거절하지 않음"]
    refused = REFUSAL in text
    text = with_variants(text)
    missing = []
    for item in q["must_include"]:
        options = item if isinstance(item, list) else [item]
        if not any(o in text for o in options):
            missing.append("|".join(options))
    if refused:
        missing.append("답이 있는데 거절함")
    return not missing, missing


def cited(q: dict, text: str) -> bool | None:
    if not q["answerable"]:
        return None
    lines = [l for l in text.splitlines() if l.strip().startswith("출처")]
    return any(s in lines[-1] for s in q["sources"]) if lines else False


def load_saved() -> dict:
    if not RESULTS_PATH.exists():
        return {}
    rows = [json.loads(l) for l in RESULTS_PATH.read_text(encoding="utf-8").splitlines() if l]
    return {r["id"]: r for r in rows}


def save(saved: dict, order: list[str]):
    rows = [saved[i] for i in order if i in saved]
    RESULTS_PATH.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    env = load_env()
    args = sys.argv[1:]
    questions = [json.loads(l) for l in QUESTIONS_PATH.read_text(encoding="utf-8").splitlines() if l]
    order = [q["id"] for q in questions]

    saved = {} if "--fresh" in args else load_saved()
    selected = [a for a in args if not a.startswith("--")]

    if "--regrade" in args:
        by_id = {q["id"]: q for q in questions}
        for r in saved.values():
            r["correct"], r["missing"] = grade(by_id[r["id"]], r["answer"])
            r["cited_source"] = cited(by_id[r["id"]], r["answer"])
        save(saved, order)
        todo = []
    elif selected:
        todo = [q for q in questions if q["id"] in selected]
    else:
        todo = [q for q in questions if q["id"] not in saved]
    print(f"모델: {CHAT_MODEL} | 풀 문제 {len(todo)}개 (저장된 결과 {len(saved)}개)")

    for i, q in enumerate(todo, start=1):
        try:
            out = answer(q["question"], env)
        except RuntimeError as e:
            print(f"\n⛔ {q['id']}에서 멈춤: {str(e)[:200]}")
            print("   지금까지 결과는 저장됐어요. 나중에 같은 명령으로 다시 실행하면 이어서 풀어요.")
            break
        ok, missing = grade(q, out["answer"])
        saved[q["id"]] = {
            "id": q["id"],
            "category": q["category"],
            "question": q["question"],
            "expected": q["expected_answer"],
            "answer": out["answer"],
            "correct": ok,
            "missing": missing,
            "cited_source": cited(q, out["answer"]),
            "retrieved": out["retrieved"],
        }
        save(saved, order)
        print(f"[{i}/{len(todo)}] {q['id']} {'✅' if ok else '❌'} {q['question']}")
        time.sleep(REQUEST_INTERVAL)

    results = [saved[i] for i in order if i in saved]
    if not results:
        return
    if len(results) < len(questions):
        print(f"\n⚠️ 아직 {len(questions) - len(results)}문제가 남아 있어요. 아래는 푼 문제까지의 중간 결과예요.")

    by_cat = defaultdict(list)
    for r in results:
        by_cat[r["category"]].append(r)

    print(f"\n답변 채점: 질문 {len(results)}개\n")
    print(f"{'종류':<14}{'개수':>4}{'정답률':>8}{'출처 일치':>10}")
    for name, rows in [*by_cat.items(), ("전체", results)]:
        acc = sum(r["correct"] for r in rows) / len(rows)
        cite_rows = [r for r in rows if r["cited_source"] is not None]
        cite = f"{sum(r['cited_source'] for r in cite_rows) / len(cite_rows):.0%}" if cite_rows else "-"
        print(f"{name:<14}{len(rows):>4}{acc:>8.0%}{cite:>10}")

    wrong = [r for r in results if not r["correct"]]
    print(f"\n틀린 질문 {len(wrong)}개:")
    for r in wrong:
        print(f"\n  {r['id']} [{r['category']}] {r['question']}")
        print(f"     빠진 것: {', '.join(r['missing'])}")
        print(f"     모범 답안: {r['expected']}")
        print(f"     실제 답변: {r['answer'].replace(chr(10), ' ')[:300]}")
    print(f"\n자세한 결과: {RESULTS_PATH}")


if __name__ == "__main__":
    main()
