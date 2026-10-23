"""질문 하나로 Vector DB를 검색해 가까운 조각을 보여준다.

실행: python scripts/search.py "연차 며칠이야?"
"""
import sys

from rag_common import Supabase, embed, load_env

TOP_K = 5


def search(question: str, env: dict, top_k: int = TOP_K) -> list[dict]:
    [vector] = embed([question], env["GEMINI_API_KEY"], "RETRIEVAL_QUERY")
    return Supabase(env).rpc("match_chunks", {"query_embedding": vector, "match_count": top_k})


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    question = " ".join(sys.argv[1:]) or "연차 며칠이야?"
    print(f"질문: {question}\n")
    for rank, hit in enumerate(search(question, load_env()), start=1):
        meta = hit["metadata"]
        preview = hit["content"].split("\n", 1)[-1].replace("\n", " ")[:80]
        print(f"{rank}. [{hit['similarity']:.3f}] {meta['ref']} (p.{','.join(map(str, meta['pages']))})")
        print(f"   {preview}…")


if __name__ == "__main__":
    main()
