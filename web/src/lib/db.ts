// Supabase 접근. 서버의 비밀 키로만 접속하며, 브라우저는 이 파일을 직접 쓰지 않는다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";
import type { AnswerMeta, ConversationSummary } from "./types";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseKey } = getEnv();
    client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// 조회는 결과가 없어도 빈 배열이 오고, insert/update처럼 결과를 받지 않는 호출만 null이 온다.
function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`DB 오류: ${result.error.message}`);
  return result.data as T;
}

export interface ChunkRow {
  id: string;
  content: string;
  metadata: { ref: string; heading: string; pages: number[]; section: string };
  similarity?: number;
}

// ---------- 검색 ----------

export async function matchChunks(embedding: number[], count: number): Promise<ChunkRow[]> {
  return check(await db().rpc("match_chunks", { query_embedding: embedding, match_count: count }));
}

export async function chunksByRefs(refs: string[]): Promise<ChunkRow[]> {
  if (refs.length === 0) return [];
  return check(await db().from("chunks").select("id,content,metadata").in("metadata->>ref", refs).order("id"));
}

// ---------- 대화 ----------

export async function listConversations(clientId: string): Promise<ConversationSummary[]> {
  return check(
    await db()
      .from("conversations")
      .select("id,title,updated_at")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(50),
  );
}

export async function conversationBelongsTo(id: string, clientId: string): Promise<boolean> {
  const rows = check(await db().from("conversations").select("id").eq("id", id).eq("client_id", clientId));
  return rows.length > 0;
}

export async function createConversation(clientId: string, title: string): Promise<string> {
  const row = check<{ id: string }>(
    await db().from("conversations").insert({ client_id: clientId, title }).select("id").single(),
  );
  return row.id;
}

export async function touchConversation(id: string) {
  check(await db().from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id));
}

export async function deleteConversation(id: string, clientId: string) {
  check(await db().from("conversations").delete().eq("id", id).eq("client_id", clientId));
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  search: AnswerMeta | null;
}

export async function listMessages(conversationId: string, limit = 200): Promise<MessageRow[]> {
  return check(
    await db()
      .from("messages")
      .select("id,role,content,model,search")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit),
  );
}

export async function insertMessage(row: {
  conversation_id: string;
  client_id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  search?: AnswerMeta;
}) {
  check(await db().from("messages").insert(row));
}

/** 최근 24시간 동안 이 브라우저가 보낸 질문 수 */
export async function countRecentQuestions(clientId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("role", "user")
    .gte("created_at", since);
  if (error) throw new Error(`DB 오류: ${error.message}`);
  return count ?? 0;
}
