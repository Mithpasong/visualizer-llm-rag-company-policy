// GET /api/conversations?clientId=... — 이 브라우저의 대화 목록
import { listConversations } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!UUID.test(clientId)) return Response.json({ error: "잘못된 사용자 ID예요." }, { status: 400 });
  try {
    return Response.json({ conversations: await listConversations(clientId) });
  } catch (error) {
    console.error("[api/conversations]", error);
    return Response.json({ error: error instanceof Error ? error.message : "서버 오류가 발생했어요." }, { status: 500 });
  }
}
