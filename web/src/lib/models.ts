// 화면과 서버가 함께 쓰는 모델 목록. 서버는 이 목록에 있는 모델만 허용한다.
// 모델 설명 문구는 언어별로 lib/i18n.ts 에 있다.
export const CHAT_MODELS = [
  { id: "gemini-3.5-flash", label: "3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "3.5 Flash Lite" },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_MODEL: ChatModelId = "gemini-3.5-flash";

// 질문 분류(규정 질문인지)와 후속 질문 다시 쓰기는 빠르고 저렴한 모델로 한다.
export const ROUTER_MODEL: ChatModelId = "gemini-3.5-flash-lite";

export function isChatModel(value: unknown): value is ChatModelId {
  return CHAT_MODELS.some((m) => m.id === value);
}

export function modelLabel(id: string | null | undefined): string {
  return CHAT_MODELS.find((m) => m.id === id)?.label ?? id ?? "";
}
