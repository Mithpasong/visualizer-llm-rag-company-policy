"""Vector DB의 768차원 벡터를 PCA로 3차원으로 줄여 웹 3D 시각화용 파일을 만든다.

실행: python scripts/build_vector_map.py   (ingest.py 로 DB를 바꾼 뒤 다시 실행)
출력: web/public/vector-map.json   (브라우저가 그리는 점 114개의 좌표)
      web/src/lib/pca-basis.json   (서버가 질문 벡터를 같은 3D 공간에 찍을 때 쓰는 변환 기준)

PCA는 "데이터가 가장 넓게 퍼진 방향 3개"를 골라 그 방향으로만 본 그림이다.
768차원의 거리를 완벽히 보존하지는 못하므로, 3D에서 가까워 보여도 실제 유사도와 다를 수 있다.
"""
import json
import sys
import urllib.parse
from pathlib import Path

import numpy as np

from rag_common import Supabase, _request, load_env

POINTS_PATH = Path("web/public/vector-map.json")
BASIS_PATH = Path("web/src/lib/pca-basis.json")
RADIUS = 10  # 3D 화면에서 점들이 퍼지는 대략적인 반지름


def fetch_all(db: Supabase) -> list[dict]:
    query = urllib.parse.urlencode({"select": "id,content,metadata,embedding", "order": "id"})
    return _request(f"{db.base}/rest/v1/chunks?{query}", headers=db.headers)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    rows = fetch_all(Supabase(load_env()))
    # pgvector 값은 "[0.1,0.2,...]" 문자열로 온다.
    vectors = np.array([json.loads(r["embedding"]) for r in rows], dtype=np.float64)

    mean = vectors.mean(axis=0)
    centered = vectors - mean
    _, singular, vt = np.linalg.svd(centered, full_matrices=False)
    components = vt[:3]
    coords = centered @ components.T
    scale = RADIUS / np.abs(coords).max()
    explained = (singular**2 / (singular**2).sum())[:3]

    points = []
    for row, (x, y, z) in zip(rows, coords * scale):
        meta = row["metadata"]
        body = row["content"].split("\n", 1)[-1].replace("\n", " ")
        points.append(
            {
                "id": row["id"],
                "ref": meta["ref"],
                "section": meta["section"],
                "kind": meta["kind"],
                "pages": meta["pages"],
                "preview": body[:90],
                "position": [round(float(x), 4), round(float(y), 4), round(float(z), 4)],
            }
        )

    POINTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    POINTS_PATH.write_text(
        json.dumps({"explainedVariance": [round(float(e), 4) for e in explained], "points": points}, ensure_ascii=False),
        encoding="utf-8",
    )
    BASIS_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASIS_PATH.write_text(
        json.dumps({"mean": mean.round(7).tolist(), "components": components.round(7).tolist(), "scale": float(scale)}),
        encoding="utf-8",
    )
    print(f"점 {len(points)}개 → {POINTS_PATH}")
    print(f"3개 축이 설명하는 분산 비율: {', '.join(f'{e:.1%}' for e in explained)} (합계 {explained.sum():.1%})")


if __name__ == "__main__":
    main()
