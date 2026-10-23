// GET    /api/conversations/:id?clientId=... — 대화의 메시지 불러오기
// DELETE /api/conversations/:id?clientId=... — 대화 삭제
import { conversationBelongsTo, deleteConversation, listMessages } from "@/lib/db";
import type { ChatMessage } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!UUID.test(id) || !UUID.test(clientId) || !(await conversationBelongsTo(id, clientId))) return null;
  return { id, clientId };
}

export async function GET(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await authorize(request, ctx);
  if (!auth) return Response.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
  const messages: ChatMessage[] = (await listMessages(auth.id)).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    meta: m.search,
  }));
  return Response.json({ messages });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await authorize(request, ctx);
  if (!auth) return Response.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
  await deleteConversation(auth.id, auth.clientId);
  return new Response(null, { status: 204 });
}
