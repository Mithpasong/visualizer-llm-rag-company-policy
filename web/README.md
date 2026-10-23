# web — Next.js 채팅 앱

Mithpasong 사내 규정 RAG 챗봇의 웹 앱이에요. 프로젝트 전체 설명은 [루트 README](../README.md)를 보세요.

```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # http://localhost:3000
```

| 경로 | 역할 |
|---|---|
| `src/app/api/chat/route.ts` | 질문 분류 → 벡터 검색 → 답변 스트리밍(NDJSON) → 대화 저장 |
| `src/app/api/conversations/` | 대화 목록, 불러오기, 삭제 |
| `src/lib/rag.ts` | 분류·검색·참조 따라가기·프롬프트 |
| `src/components/VectorScene.tsx` | three.js 3D 벡터 검색 시각화 |
| `public/vector-map.json` | `scripts/build_vector_map.py` 가 만든 3D 좌표 |
