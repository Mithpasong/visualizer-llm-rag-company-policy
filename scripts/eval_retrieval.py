"""테스트 질문으로 검색 성능을 채점한다. (LLM 답변 없이 "맞는 조각을 찾아왔는가"만 본다)

실행: python scripts/eval_retrieval.py
- Hit@k: 정답 근거(sources) 중 하나라도 검색 결과 상위 k개 안에 있으면 맞힌 것으로 본다.
- All@5: 근거가 여러 개인 질문에서 모든 근거가 상위 5개 안에 있는지 본다.
- 결과는 data/eval/retrieval_results.jsonl 에 저장해서 틀린 질문을 자세히 볼 수 있다.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from rag_common import Supabase, embed, load_env

QUESTIONS_PATH = Path("data/eval/questions.jsonl")
RESULTS_PATH = Path("data/eval/retrieval_results.jsonl")
TOP_K = 5


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    env = load_env()
    db = Supabase(env)

    questions = [json.loads(l) for l in QUESTIONS_PATH.read_text(encoding="utf-8").splitlines() if l]
    targets = [q for q in questions if q["answerable"]]  # 규정에 없는 질문은 검색 채점 대상이 아니다.
    vectors = embed([q["question"] for q in targets], env["GEMINI_API_KEY"], "RETRIEVAL_QUERY")

    results = []
    for q, vector in zip(targets, vectors):
        hits = db.rpc("match_chunks", {"query_embedding": vector, "match_count": TOP_K})
        refs = [h["metadata"]["ref"] for h in hits]
        ranks = [refs.index(s) + 1 for s in q["sources"] if s in refs]
        results.append(
            {
                "id": q["id"],
                "category": q["category"],
                "question": q["question"],
                "sources": q["sources"],
                "retrieved": refs,
                "first_rank": min(ranks) if ranks else None,
                "all_found": len(ranks) == len(q["sources"]),
            }
        )

    RESULTS_PATH.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n", encoding="utf-8")

    def rate(rows, k):
        return sum(1 for r in rows if r["first_rank"] and r["first_rank"] <= k) / len(rows)

    by_cat = defaultdict(list)
    for r in results:
        by_cat[r["category"]].append(r)

    print(f"검색 채점: 질문 {len(results)}개 (규정에 없는 질문 제외)\n")
    print(f"{'종류':<14}{'개수':>4}{'Hit@1':>8}{'Hit@3':>8}{'Hit@5':>8}{'All@5':>8}")
    for name, rows in [*by_cat.items(), ("전체", results)]:
        all5 = sum(r["all_found"] for r in rows) / len(rows)
        print(f"{name:<14}{len(rows):>4}{rate(rows, 1):>8.0%}{rate(rows, 3):>8.0%}{rate(rows, 5):>8.0%}{all5:>8.0%}")

    misses = [r for r in results if not r["first_rank"]]
    print(f"\n상위 {TOP_K}개 안에 근거를 하나도 못 찾은 질문 {len(misses)}개:")
    for r in misses:
        print(f"  {r['id']} [{r['category']}] {r['question']}")
        print(f"     정답 근거: {r['sources']}  /  찾은 것: {r['retrieved'][:3]}")
    print(f"\n자세한 결과: {RESULTS_PATH}")


if __name__ == "__main__":
    main()
