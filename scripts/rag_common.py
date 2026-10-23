"""임베딩(Gemini)과 Vector DB(Supabase) 호출을 모아 둔 공통 모듈. 추가 패키지 없이 표준 라이브러리만 쓴다."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 768  # supabase/schema.sql 의 vector(768) 과 같아야 한다.
EMBED_BATCH = 50

# 2026-10-23 무료 키 기준으로 고른 모델이다.
# - gemini-2.5-flash: 신규 사용자에게 제공되지 않음
# - gemini-3.8-flash: 응답이 70초 가까이 걸림
# - gemini-3.5-flash: 빠르지만 무료 한도가 약 20회(다 쓰면 2시간 대기) → 결제 키로 바꾼 뒤 사용
# - gemini-3.5-flash-lite: 비교용. 결과는 data/eval/history/ 에 있다.
CHAT_MODEL = "gemini-3.5-flash"


def load_env(path: str = ".env") -> dict:
    env = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip("\"'")
    # 대시보드에서 REST 주소(/rest/v1/)까지 복사한 경우에도 동작하게 한다.
    env["SUPABASE_URL"] = env.get("SUPABASE_URL", "").split("/rest/v1")[0].rstrip("/")
    return env


def _request(url: str, method: str = "GET", body=None, headers: dict | None = None, retries: int = 5):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json", **(headers or {})}
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8")
            # 하루 한도처럼 오래 기다려야 하는 429는 다시 시도해도 소용없으므로 바로 멈춘다.
            delay = re.search(r'"retryDelay":\s*"(\d+)s"', detail)
            if e.code == 429 and delay and int(delay.group(1)) > 120:
                minutes = int(delay.group(1)) // 60
                raise RuntimeError(f"무료 한도 초과: 약 {minutes}분 뒤에 다시 쓸 수 있어요. ({url.split('/')[-1]})") from None
            # 분당 한도(429)나 일시적 서버 오류(5xx)는 잠시 기다렸다가 다시 시도한다.
            if (e.code == 429 or e.code >= 500) and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  ⏳ {e.code} 응답, {wait}초 후 다시 시도합니다.")
                time.sleep(wait)
                continue
            raise RuntimeError(f"{method} {url} → {e.code}: {detail[:500]}") from None
        except (TimeoutError, urllib.error.URLError) as e:
            # 응답이 늦거나 네트워크가 잠깐 끊긴 경우도 다시 시도한다.
            if attempt < retries - 1:
                print(f"  ⏳ 연결 문제({type(e).__name__}), 10초 후 다시 시도합니다.")
                time.sleep(10)
                continue
            raise


def embed(texts: list[str], api_key: str, task_type: str) -> list[list[float]]:
    """글 목록을 벡터 목록으로 바꾼다.

    task_type: 문서는 "RETRIEVAL_DOCUMENT", 질문은 "RETRIEVAL_QUERY".
    Gemini는 같은 문장이라도 용도에 맞춰 조금 다른 벡터를 만들어 검색 정확도를 높인다.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents"
    vectors = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start : start + EMBED_BATCH]
        body = {
            "requests": [
                {
                    "model": f"models/{EMBED_MODEL}",
                    "content": {"parts": [{"text": t}]},
                    "taskType": task_type,
                    "outputDimensionality": EMBED_DIM,
                }
                for t in batch
            ]
        }
        res = _request(url, "POST", body, {"x-goog-api-key": api_key})
        vectors.extend(e["values"] for e in res["embeddings"])
    return vectors


def generate(prompt: str, system: str, api_key: str) -> str:
    """LLM에게 답변을 만들게 한다. 생각 과정(thought)은 빼고 최종 답만 돌려준다."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{CHAT_MODEL}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},  # 규정 안내는 매번 같은 답이 나오는 게 좋다.
    }
    res = _request(url, "POST", body, {"x-goog-api-key": api_key})
    parts = res["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()


class Supabase:
    def __init__(self, env: dict):
        self.base = env["SUPABASE_URL"]
        key = env["SUPABASE_SECRET_KEY"]
        self.headers = {"apikey": key}
        # 예전 방식 service_role 키(JWT)는 Authorization 헤더도 필요하다.
        if not key.startswith("sb_"):
            self.headers["Authorization"] = f"Bearer {key}"

    def upsert(self, table: str, rows: list[dict]):
        """같은 id가 있으면 덮어쓰고, 없으면 새로 넣는다."""
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        _request(f"{self.base}/rest/v1/{table}", "POST", rows, headers)

    def select_ids(self, table: str) -> list[str]:
        rows = _request(f"{self.base}/rest/v1/{table}?select=id", headers=self.headers)
        return [r["id"] for r in rows]

    def delete_ids(self, table: str, ids: list[str]):
        quoted = ",".join(f'"{i}"' for i in ids)
        query = urllib.parse.urlencode({"id": f"in.({quoted})"})
        _request(f"{self.base}/rest/v1/{table}?{query}", "DELETE", headers=self.headers)

    def select_by_refs(self, table: str, refs: list[str]) -> list[dict]:
        """metadata.ref 값으로 조각을 가져온다. (예: "별표 9")"""
        quoted = ",".join(f'"{r}"' for r in refs)
        query = urllib.parse.urlencode({"select": "id,content,metadata", "metadata->>ref": f"in.({quoted})", "order": "id"})
        return _request(f"{self.base}/rest/v1/{table}?{query}", headers=self.headers)

    def rpc(self, function: str, params: dict):
        return _request(f"{self.base}/rest/v1/rpc/{function}", "POST", params, self.headers)
