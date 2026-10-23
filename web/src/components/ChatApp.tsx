"use client";

import { useCallback, useEffect, useState } from "react";
import { getClientId } from "@/lib/client";
import { DICTIONARIES, type Locale } from "@/lib/i18n";
import { DEFAULT_MODEL, type ChatModelId } from "@/lib/models";
import type { AnswerMeta, ChatMessage, ConversationSummary, StreamEvent } from "@/lib/types";
import Composer from "./Composer";
import { I18nContext, initialLocale, saveLocale } from "./I18nContext";
import MessageList from "./MessageList";
import PdfPanel from "./PdfPanel";
import Sidebar from "./Sidebar";
import VectorPanel from "./VectorPanel";

type PanelTab = "vector" | "pdf";

export default function ChatApp() {
  // 이 컴포넌트는 브라우저에서만 그려지므로(ClientApp 참고) localStorage를 바로 읽어도 된다.
  const [clientId] = useState(getClientId);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = DICTIONARIES[locale];

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState<ChatModelId>(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);

  // 오른쪽 패널 상태
  const [selected, setSelected] = useState<{ meta: AnswerMeta; question: string } | null>(null);
  const [focusRef, setFocusRef] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("vector");
  const [pdfPage, setPdfPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false); // 좁은 화면에서 오른쪽 패널 열기
  const [sidebarOpen, setSidebarOpen] = useState(false); // 좁은 화면에서 대화 목록 열기

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const toggleLocale = () => {
    const next: Locale = locale === "ko" ? "en" : "ko";
    setLocale(next);
    saveLocale(next);
  };

  const fetchConversations = useCallback(async (): Promise<ConversationSummary[] | null> => {
    const res = await fetch(`/api/conversations?clientId=${clientId}`);
    return res.ok ? (await res.json()).conversations : null;
  }, [clientId]);

  const loadConversations = async () => {
    const list = await fetchConversations();
    if (list) setConversations(list);
  };

  useEffect(() => {
    let cancelled = false;
    fetchConversations().then((list) => {
      if (!cancelled && list) setConversations(list);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchConversations]);

  const patchMessage = (id: string, patch: (m: ChatMessage) => Partial<ChatMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));

  const openConversation = async (id: string) => {
    setSidebarOpen(false);
    setActiveId(id);
    setMessages([]);
    const res = await fetch(`/api/conversations/${id}?clientId=${clientId}`);
    if (!res.ok) return;
    const loaded: ChatMessage[] = (await res.json()).messages;
    setMessages(loaded);
    // 마지막 검색 결과를 3D 화면에 다시 보여준다.
    const lastIndex = loaded.findLastIndex((m) => m.role === "assistant" && (m.meta?.hits.length ?? 0) > 0);
    setSelected(lastIndex >= 0 ? { meta: loaded[lastIndex].meta!, question: loaded[lastIndex - 1]?.content ?? "" } : null);
    setFocusRef(null);
  };

  const startNew = () => {
    setSidebarOpen(false);
    setActiveId(null);
    setMessages([]);
    setSelected(null);
    setFocusRef(null);
  };

  const removeConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}?clientId=${clientId}`, { method: "DELETE" });
    if (id === activeId) startNew();
    loadConversations();
  };

  const openPdf = (ref: string, page: number) => {
    setFocusRef(ref);
    setPdfPage(page);
    setTab("pdf");
    setPanelOpen(true);
  };

  const showSearch = (meta: AnswerMeta, question: string) => {
    setSelected({ meta, question });
    setFocusRef(null);
    setTab("vector");
    setPanelOpen(true);
  };

  const send = async (text: string) => {
    if (busy) return;
    setBusy(true);
    const assistantId = crypto.randomUUID();
    setMessages((list) => [
      ...list,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", model, pending: true },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, conversationId: activeId, message: text, model, locale }),
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: t.message.requestFailed }));
        patchMessage(assistantId, () => ({ content: error, error: true, model: null }));
        return;
      }

      // 서버가 한 줄에 하나씩 보내는 이벤트를 읽는다.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) handleEvent(JSON.parse(line) as StreamEvent, assistantId, text);
      }
    } catch {
      patchMessage(assistantId, (m) => ({ content: m.content || t.message.disconnected, error: !m.content }));
    } finally {
      patchMessage(assistantId, () => ({ pending: false }));
      setBusy(false);
    }
  };

  const handleEvent = (event: StreamEvent, assistantId: string, question: string) => {
    switch (event.type) {
      case "conversation":
        setActiveId(event.id);
        setConversations((list) => {
          const existing = list.find((c) => c.id === event.id);
          const updated = { id: event.id, title: existing?.title ?? event.title, updated_at: new Date().toISOString() };
          return [updated, ...list.filter((c) => c.id !== event.id)];
        });
        break;
      case "meta":
        // 규정과 무관한 질문은 검색을 하지 않으므로 모델 표시도 지운다.
        patchMessage(assistantId, () => ({
          meta: event.meta,
          ...(event.meta.category === "regulation" ? {} : { model: null }),
        }));
        if (event.meta.category === "regulation") {
          setSelected({ meta: event.meta, question });
          setFocusRef(null);
          setTab("vector");
        }
        break;
      case "delta":
        patchMessage(assistantId, (m) => ({ content: m.content + event.text }));
        break;
      case "error":
        patchMessage(assistantId, (m) => ({ content: m.content ? `${m.content}\n\n⚠️ ${event.message}` : event.message, error: true }));
        break;
      case "done":
        break;
    }
  };

  const panel = (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center border-b border-white/10 bg-slate-950 px-2">
        {(["vector", "pdf"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2.5 text-sm ${
              tab === key ? "border-indigo-400 font-semibold text-indigo-200" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.tabs[key]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="ml-auto rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/5 2xl:hidden"
        >
          {t.tabs.close}
        </button>
      </div>
      {/* 두 탭을 모두 그려 두고 숨기기만 해서, 탭을 바꿔도 3D 장면과 PDF를 다시 불러오지 않는다. */}
      <div className={`min-h-0 flex-1 ${tab === "vector" ? "" : "hidden"}`}>
        <VectorPanel selected={selected} focusRef={focusRef} onFocus={setFocusRef} onOpenPdf={openPdf} />
      </div>
      <div className={`min-h-0 flex-1 ${tab === "pdf" ? "" : "hidden"}`}>
        <PdfPanel page={pdfPage} label={focusRef} />
      </div>
    </div>
  );

  const sidebar = (
    <Sidebar conversations={conversations} activeId={activeId} onSelect={openConversation} onNew={startNew} onDelete={removeConversation} />
  );

  return (
    <I18nContext.Provider value={t}>
      <div className="flex h-dvh overflow-hidden bg-slate-950 text-slate-100">
        {/* 대화 목록: 넓은 화면은 항상, 좁은 화면은 메뉴 버튼으로 연다. */}
        <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="w-72">{sidebar}</div>
            <button type="button" aria-label={t.tabs.close} className="flex-1 bg-black/60" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-[#0b1020]">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded px-2 py-1 text-slate-400 hover:bg-white/5 lg:hidden">
              ☰
            </button>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
              {conversations.find((c) => c.id === activeId)?.title ?? t.header.newChat}
            </div>
            <button
              type="button"
              onClick={toggleLocale}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
            >
              🌐 {t.switchLanguage}
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5 2xl:hidden"
            >
              {t.header.openPanel}
            </button>
          </header>
          <div className="space-y-0.5 border-b border-amber-400/20 bg-amber-400/10 px-4 py-1.5 text-center text-[11px] leading-relaxed text-amber-200">
            <p>⚠️ {t.notice}</p>
            <p className="text-amber-200/70">ℹ️ {t.disclaimer}</p>
          </div>
          <MessageList messages={messages} onExample={send} onShowSearch={showSearch} onOpenPdf={openPdf} />
          <Composer model={model} onModelChange={setModel} onSend={send} busy={busy} />
        </main>

        {/* 오른쪽 패널: 아주 넓은 화면은 항상, 그 외에는 버튼으로 연다. */}
        <aside className="hidden w-[42%] max-w-[760px] shrink-0 border-l border-white/10 2xl:block">{panel}</aside>
        {panelOpen && <div className="fixed inset-0 z-30 2xl:hidden">{panel}</div>}
      </div>
    </I18nContext.Provider>
  );
}
