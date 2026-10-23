// 화면과 서버가 함께 쓰는 타입

export type Vec3 = [number, number, number];

/** 질문 분류 결과: 규정 질문 / 인사 / 규정과 무관한 질문 */
export type Category = "regulation" | "greeting" | "off_topic";

export interface SearchHit {
  id: string;
  ref: string; // 예: "휴가규정 제2조", "별표 9"
  heading: string;
  pages: number[];
  similarity: number | null; // 참조로 따라온 조각은 검색 점수가 없다.
  followed: boolean; // true면 "별표 9에 따른다" 같은 참조를 따라 가져온 조각
}

/** 답변 하나에 딸린 정보. DB messages.search 에 그대로 저장한다. */
export interface AnswerMeta {
  category: Category;
  standaloneQuestion?: string; // 앞 대화를 반영해 다시 쓴 검색용 질문
  queryPosition?: Vec3; // 질문 벡터를 3D 지도에 찍은 위치
  hits: SearchHit[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  meta?: AnswerMeta | null;
  pending?: boolean;
  error?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** /api/chat 이 한 줄에 하나씩(NDJSON) 보내는 이벤트 */
export type StreamEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "meta"; meta: AnswerMeta }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** 3D 지도의 점 하나 (public/vector-map.json) */
export interface MapPoint {
  id: string;
  ref: string;
  section: string;
  kind: string;
  pages: number[];
  preview: string;
  position: Vec3;
}

export interface VectorMap {
  explainedVariance: number[];
  points: MapPoint[];
}
