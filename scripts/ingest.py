"""data/processed/chunks.jsonl 의 조각을 임베딩해서 Supabase chunks 테이블에 넣는다.

실행: python scripts/ingest.py
- 같은 id의 조각은 덮어쓰므로 여러 번 실행해도 안전하다.
- 이번 chunks.jsonl 에 없는 옛 조각은 DB에서 지운다. (규정집이 바뀌었을 때 낡은 조각이 남지 않게)
"""
import json
import sys
from pathlib import Path

from rag_common import Supabase, embed, load_env

CHUNKS_PATH = Path("data/processed/chunks.jsonl")
UPSERT_BATCH = 50


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    env = load_env()
    db = Supabase(env)

    chunks = [json.loads(line) for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines() if line]
    print(f"조각 {len(chunks)}개를 임베딩합니다...")
    vectors = embed([c["text"] for c in chunks], env["GEMINI_API_KEY"], "RETRIEVAL_DOCUMENT")

    rows = [
        {"id": c["id"], "content": c["text"], "metadata": c["metadata"], "embedding": v}
        for c, v in zip(chunks, vectors)
    ]
    for start in range(0, len(rows), UPSERT_BATCH):
        db.upsert("chunks", rows[start : start + UPSERT_BATCH])
        print(f"  저장 {min(start + UPSERT_BATCH, len(rows))}/{len(rows)}")

    stale = sorted(set(db.select_ids("chunks")) - {c["id"] for c in chunks})
    if stale:
        db.delete_ids("chunks", stale)
    print(f"완료: {len(rows)}개 저장, 낡은 조각 {len(stale)}개 삭제")


if __name__ == "__main__":
    main()
