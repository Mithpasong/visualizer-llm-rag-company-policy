// 브라우저에서만 쓰는 도우미
import type { SearchHit } from "./types";

const CLIENT_ID_KEY = "mithpasong-client-id";

/** 로그인 대신 브라우저마다 익명 ID를 만들어 대화를 구분한다. */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID(); // 저장소를 못 쓰는 환경(시크릿 창 등)에서는 이번 접속에만 쓴다.
  }
}

export const PDF_URL = "/mithpasong-handbook.pdf";

// 한국어 답변은 "출처:", 영어 답변은 "Sources:" 로 끝난다.
const CITATION_LINE = /^\s*\**\s*(?:출처|Sources?)\s*\**\s*[:：]\s*(.+)$/im;
const REF_IN_TEXT = /(별표 \d+|부록 [A-Z]|부칙 제\d+조|[가-힣 ]*?규정 제\d+조|^제\d+조)/;

export interface Citation {
  ref: string;
  page: number | null;
}

/**
 * 답변 마지막의 "출처: 휴가규정 제2조, 별표 1" (영어 답변은 "Sources: ...") 줄을 떼어 내고 출처 목록으로 바꾼다.
 * "복리후생규정 제2조, 제5조"처럼 줄여 쓴 경우는 앞 규정 이름을 이어 붙인다.
 */
export function splitCitations(content: string, hits: SearchHit[]): { body: string; citations: Citation[] } {
  const match = content.match(CITATION_LINE);
  if (!match) return { body: content, citations: [] };

  const citations: Citation[] = [];
  let lastRegulation = "";
  for (const raw of match[1].split(/[,，、]/)) {
    const item = raw.replace(/[[\]*]/g, "").replace(/Mithpasong 사내 규정집 v[\d.]+/, "").trim();
    const found = item.match(REF_IN_TEXT)?.[1]?.trim();
    if (!found) continue;
    let ref = found;
    if (/^제\d+조/.test(ref) && lastRegulation) ref = `${lastRegulation} ${ref}`;
    const regulation = ref.match(/^(.*규정|부칙) 제\d+조/)?.[1];
    if (regulation) lastRegulation = regulation;
    if (citations.some((c) => c.ref === ref)) continue;
    const hit = hits.find((h) => h.ref === ref);
    citations.push({ ref, page: hit?.pages[0] ?? null });
  }
  return { body: content.replace(match[0], "").trim(), citations };
}
