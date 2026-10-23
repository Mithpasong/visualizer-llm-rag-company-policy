// POST /api/chat — 질문 하나를 받아 분류 → 검색 → 답변 스트리밍 → 대화 저장까지 한다.
// 응답은 한 줄에 이벤트 하나씩(NDJSON) 보낸다. 형식은 lib/types.ts 의 StreamEvent.
import {
  conversationBelongsTo,
  countRecentQuestions,
  createConversation,
  insertMessage,
  listMessages,
  touchConversation,
} from "@/lib/db";
import { getEnv } from "@/lib/env";
import { GeminiError, streamText } from "@/lib/gemini";
import { DICTIONARIES, isKoreanQuestion, isLocale, type Dictionary } from "@/lib/i18n";
import { isChatModel } from "@/lib/models";
import { ANSWER_PROMPT, buildContents, GREETING_REPLY, OFF_TOPIC_REPLY, retrieve, routeQuestion } from "@/lib/rag";
import type { AnswerMeta, StreamEvent } from "@/lib/types";

export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function errorMessage(error: unknown, t: Dictionary): string {
  if (error instanceof GeminiError && error.status === 429) return t.errors.aiLimit;
  return error instanceof Error ? error.message : t.errors.server;
}

// 브라우저가 보내는 값이라 형식을 믿지 않고 하나씩 검사한다.
interface ChatRequest {
  clientId?: unknown;
  conversationId?: unknown;
  message?: unknown;
  model?: unknown;
  locale?: unknown;
}

export async function POST(request: Request) {
  const body: ChatRequest = (await request.json().catch(() => null)) ?? {};
  // locale은 오류 안내 문구의 언어에만 쓴다. 질문과 답변은 항상 한국어다.
  const t = DICTIONARIES[isLocale(body.locale) ? body.locale : "ko"];
  try {
    return await handle(body, t);
  } catch (error) {
    // 스트리밍을 시작하기 전의 오류(DB 연결 등)도 이유를 담아 돌려줘야 화면에서 원인을 알 수 있다.
    console.error("[api/chat]", error);
    return fail(500, errorMessage(error, t));
  }
}

async function handle(body: ChatRequest, t: Dictionary) {
  const { clientId, model } = body;
  const question = typeof body.message === "string" ? body.message.trim() : "";
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

  if (typeof clientId !== "string" || !UUID.test(clientId)) return fail(400, t.errors.badClient);
  if (!question) return fail(400, t.errors.emptyQuestion);
  if (question.length > MAX_QUESTION_LENGTH) return fail(400, t.errors.tooLong(MAX_QUESTION_LENGTH));
  if (!isKoreanQuestion(question)) return fail(400, t.errors.koreanOnly);
  if (!isChatModel(model)) return fail(400, t.errors.badModel);
  if (conversationId !== null && (!UUID.test(conversationId) || !(await conversationBelongsTo(conversationId, clientId)))) {
    return fail(404, t.errors.notFound);
  }

  const { dailyLimit } = getEnv();
  if ((await countRecentQuestions(clientId)) >= dailyLimit) return fail(429, t.errors.dailyLimit(dailyLimit));

  const history = conversationId ? await listMessages(conversationId) : [];
  const title = question.length > 40 ? `${question.slice(0, 40)}…` : question;
  if (!conversationId) conversationId = await createConversation(clientId, title);
  const convId = conversationId;
  await insertMessage({ conversation_id: convId, client_id: clientId, role: "user", content: question });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const save = async (content: string, meta: AnswerMeta, usedModel?: string) => {
        await insertMessage({
          conversation_id: convId,
          client_id: clientId,
          role: "assistant",
          content,
          model: usedModel,
          search: meta,
        });
        await touchConversation(convId);
      };

      try {
        send({ type: "conversation", id: convId, title });

        // 1) 규정 질문인지 분류하고, 후속 질문이면 완전한 (한국어) 질문으로 다시 쓴다.
        const route = await routeQuestion(history, question);
        if (route.category !== "regulation") {
          const reply = route.category === "greeting" ? GREETING_REPLY : OFF_TOPIC_REPLY;
          const meta: AnswerMeta = { category: route.category, hits: [] };
          send({ type: "meta", meta });
          send({ type: "delta", text: reply });
          await save(reply, meta);
          send({ type: "done" });
          return;
        }

        // 2) Vector DB 검색 + 참조 따라가기
        const retrieval = await retrieve(route.standaloneQuestion);
        send({ type: "meta", meta: retrieval.meta });

        // 3) 답변을 만들어지는 대로 보낸다.
        let answer = "";
        const contents = buildContents(history, question, route.standaloneQuestion, retrieval);
        for await (const text of streamText(model, ANSWER_PROMPT, contents)) {
          answer += text;
          send({ type: "delta", text });
        }
        await save(answer, retrieval.meta, model);
        send({ type: "done" });
      } catch (error) {
        console.error("[api/chat]", error);
        send({ type: "error", message: errorMessage(error, t) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
