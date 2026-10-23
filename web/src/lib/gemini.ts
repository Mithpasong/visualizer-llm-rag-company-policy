// Gemini REST API 호출 (임베딩, JSON 응답, 스트리밍 응답)
import { getEnv } from "./env";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // supabase/schema.sql 의 vector(768) 과 같아야 한다.

export interface Content {
  role: "user" | "model";
  parts: { text: string }[];
}

interface Part {
  text?: string;
  thought?: boolean;
}

export class GeminiError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(`Gemini API ${status}: ${detail.slice(0, 200)}`);
  }
}

async function call(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": getEnv().geminiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GeminiError(res.status, await res.text());
  return res;
}

// 생각 과정(thought)은 빼고 최종 답의 글자만 모은다.
function textOf(parts: Part[] | undefined): string {
  return (parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
}

/** 질문을 768차원 벡터로 바꾼다. 문서는 RETRIEVAL_DOCUMENT 로 미리 넣어 두었다. */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await call(`${EMBED_MODEL}:embedContent`, {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: EMBED_DIM,
  });
  const data = await res.json();
  return data.embedding.values;
}

/** JSON 형식으로만 답하게 한다. (질문 분류용) */
export async function generateJson<T>(model: string, system: string, prompt: string): Promise<T> {
  const res = await call(`${model}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  const data = await res.json();
  return JSON.parse(textOf(data.candidates?.[0]?.content?.parts));
}

/** 답변을 만들어지는 대로 조금씩 돌려준다. (Server-Sent Events) */
export async function* streamText(model: string, system: string, contents: Content[]): AsyncGenerator<string> {
  const res = await call(`${model}:streamGenerateContent?alt=sse`, {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.1 },
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const text = textOf(JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts);
      if (text) yield text;
    }
  }
}
