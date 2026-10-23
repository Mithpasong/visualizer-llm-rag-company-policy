// 화면 문구와 서버 안내 문구의 한국어/영어 사전. 화면과 서버가 함께 쓴다.
// 화면 언어만 바뀌고, 질문과 AI 답변은 항상 한국어다. (그래서 예시 질문은 영어 화면에서도 한국어)

export type Locale = "ko" | "en";

export function isLocale(value: unknown): value is Locale {
  return value === "ko" || value === "en";
}

/** 질문은 한국어로만 받는다. 한글이 한 글자도 없으면 거절한다. (화면과 서버가 같은 기준을 쓴다) */
export function isKoreanQuestion(text: string): boolean {
  return /[가-힣]/.test(text);
}

const KOREAN_EXAMPLES = [
  "11월에 입사하면 그해 연차는 며칠이야?",
  "배우자 할머니가 돌아가셨는데 경조금 나와?",
  "해외출장 가려면 누구 승인을 받아야 해?",
  "R&D센터 직원도 재택근무 할 수 있어?",
];

const ko = {
  dateLocale: "ko-KR",
  switchLanguage: "English",
  appName: "사내 규정 도우미",
  loading: "불러오는 중…",
  notice: "이 프로젝트는 무료 Gemini API를 함께 사용해서 원활하게 작동하지 않을 수 있습니다.",
  disclaimer:
    "본 시스템은 Mithpasong이 임의로 작성한 사내 규정 및 가상의 데이터를 기반으로 구축된 프로젝트입니다. 실제 규정이나 운영 정보를 반영한 것이 아님을 알려드립니다.",

  sidebar: {
    newChat: "＋ 새 대화",
    empty: "아직 대화가 없어요.",
    anonymousNote: "로그인 없이 이 브라우저에만 연결된 익명 ID로 대화를 저장해요.",
    deleteConfirm: "이 대화를 삭제할까요?",
    deleteLabel: "대화 삭제",
  },
  header: {
    newChat: "새 대화",
    openPanel: "🧭 3D · 📄 PDF",
  },
  tabs: {
    vector: "🧭 3D 벡터 검색",
    pdf: "📄 원본 PDF",
    close: "닫기 ✕",
  },
  hero: {
    title: "사내 규정, 무엇이든 물어보세요",
    description: "25쪽짜리 사내 규정집 PDF를 Vector DB에 넣어 두었어요. 답변마다 근거 조문과 원본 페이지를 함께 보여드려요.",
    examples: KOREAN_EXAMPLES,
  },
  composer: {
    model: "모델",
    placeholder: "회사 규정에 대해 한국어로 물어보세요. (Shift+Enter 줄바꿈)",
    koreanOnly: "질문은 한국어로만 할 수 있어요.",
    send: "보내기",
    sending: "답변 중",
    modelDescriptions: {
      "gemini-3.5-flash": "정확도 우선 · 평가 50/50",
      "gemini-3.5-flash-lite": "속도 우선 · 평가 47/50",
    } as Record<string, string>,
  },
  message: {
    assistant: "규정 도우미",
    offTopic: "규정 외 질문 · 자동 거절",
    rewritten: "앞 대화를 반영해 이렇게 검색했어요:",
    searching: "질문을 이해하고 검색하는 중…",
    writing: "관련 규정을 찾았어요. 답변을 작성하는 중…",
    sources: "출처",
    show3d: "🧭 3D로 검색 과정 보기",
    requestFailed: "요청에 실패했어요.",
    disconnected: "연결이 끊겼어요. 다시 시도해 주세요.",
  },
  vector: {
    title: (n: number) => `Vector DB · 조각 ${n}개`,
    idle: "질문하면 비슷한 조각을 찾는 과정이 여기에 보여요.",
    loading: "3D 지도를 불러오는 중…",
    hint: "점에 마우스를 올리면 내용이, 클릭하면 원본 PDF가 보여요. 드래그로 돌려볼 수 있어요.",
    caption: (pct: string) =>
      `768차원 벡터를 PCA로 3차원에 줄여 그린 근사 지도예요. 3개 축이 원래 정보의 ${pct}%만 담고 있어서, 실제 검색 순위는 3D 거리가 아니라 유사도 점수(코사인)로 정해져요.`,
    followed: "검색된 조각이 가리켜서 함께 가져옴",
    ref: "참조",
    query: "질문",
    clickToOpen: "클릭하면 원본 PDF가 열려요",
    overview: "⤢ 전체 보기",
    focus: "◎ 질문 위치로",
  },
  groups: {
    hr: "인사·근무·휴가",
    pay: "보수·복리후생",
    travel: "출장·경비",
    security: "보안·교육·징계",
    approval: "위임전결",
    appendix: "별표 (표)",
    etc: "부칙·부록·기타",
  } as Record<string, string>,
  pdf: {
    name: "Mithpasong 사내 규정집 v4.2",
    openNewTab: "새 탭에서 열기 ↗",
  },
  errors: {
    badClient: "잘못된 사용자 ID예요.",
    emptyQuestion: "질문을 입력해 주세요.",
    tooLong: (n: number) => `질문은 ${n}자까지 입력할 수 있어요.`,
    badModel: "지원하지 않는 모델이에요.",
    notFound: "대화를 찾을 수 없어요.",
    koreanOnly: "질문은 한국어로만 할 수 있어요.",
    dailyLimit: (n: number) => `하루에 ${n}번까지 질문할 수 있어요. 내일 다시 이용해 주세요.`,
    aiLimit: "AI 모델 사용량 한도에 걸렸어요. 잠시 후 다시 시도해 주세요.",
    server: "서버 오류가 발생했어요.",
  },
};

export type Dictionary = typeof ko;

const en: Dictionary = {
  dateLocale: "en-US",
  switchLanguage: "한국어",
  appName: "Policy Assistant",
  loading: "Loading…",
  notice: "This project also uses the free Gemini API, so it may not always work smoothly.",
  disclaimer:
    "This system is a project built on company regulations and fictional data written arbitrarily by Mithpasong. It does not reflect any real regulations or operational information.",

  sidebar: {
    newChat: "＋ New chat",
    empty: "No conversations yet.",
    anonymousNote: "No login needed. Chats are saved under an anonymous ID tied to this browser only.",
    deleteConfirm: "Delete this conversation?",
    deleteLabel: "Delete conversation",
  },
  header: {
    newChat: "New chat",
    openPanel: "🧭 3D · 📄 PDF",
  },
  tabs: {
    vector: "🧭 3D Vector Search",
    pdf: "📄 Source PDF",
    close: "Close ✕",
  },
  hero: {
    title: "Ask anything about company policy",
    description:
      "The 25-page company handbook PDF is stored in a vector database. Every answer shows the clauses it relies on and the original page. Questions and answers are in Korean only.",
    examples: KOREAN_EXAMPLES,
  },
  composer: {
    model: "Model",
    placeholder: "Ask about company policy in Korean. (Shift+Enter for a new line)",
    koreanOnly: "Questions must be written in Korean.",
    send: "Send",
    sending: "Answering",
    modelDescriptions: {
      "gemini-3.5-flash": "Accuracy first · eval 50/50",
      "gemini-3.5-flash-lite": "Speed first · eval 47/50",
    },
  },
  message: {
    assistant: "Policy Assistant",
    offTopic: "Not a policy question · declined",
    rewritten: "Searched using the conversation context:",
    searching: "Understanding the question and searching…",
    writing: "Found related rules. Writing the answer…",
    sources: "Sources",
    show3d: "🧭 View search in 3D",
    requestFailed: "The request failed.",
    disconnected: "Connection lost. Please try again.",
  },
  vector: {
    title: (n: number) => `Vector DB · ${n} chunks`,
    idle: "Ask a question to watch the search for similar chunks here.",
    loading: "Loading the 3D map…",
    hint: "Hover a point to preview it, click to open the source PDF. Drag to rotate.",
    caption: (pct: string) =>
      `An approximate map that squeezes 768-dimensional vectors into 3D with PCA. The 3 axes keep only ${pct}% of the original information, so the real ranking comes from the similarity score (cosine), not the 3D distance.`,
    followed: "Pulled in because a retrieved chunk refers to it",
    ref: "Ref",
    query: "Query",
    clickToOpen: "Click to open the source PDF",
    overview: "⤢ Overview",
    focus: "◎ Focus query",
  },
  groups: {
    hr: "HR · Work · Leave",
    pay: "Pay · Benefits",
    travel: "Travel · Expenses",
    security: "Security · Training · Discipline",
    approval: "Approvals",
    appendix: "Appendix tables",
    etc: "Supplementary · Other",
  },
  pdf: {
    name: "Mithpasong Handbook v4.2 (Korean)",
    openNewTab: "Open in new tab ↗",
  },
  errors: {
    badClient: "Invalid user ID.",
    emptyQuestion: "Please enter a question.",
    tooLong: (n: number) => `Questions can be up to ${n} characters.`,
    badModel: "That model is not supported.",
    notFound: "Conversation not found.",
    koreanOnly: "Questions must be written in Korean.",
    dailyLimit: (n: number) => `You can ask up to ${n} questions a day. Please come back tomorrow.`,
    aiLimit: "The AI model hit its usage limit. Please try again shortly.",
    server: "A server error occurred.",
  },
};

export const DICTIONARIES: Record<Locale, Dictionary> = { ko, en };
