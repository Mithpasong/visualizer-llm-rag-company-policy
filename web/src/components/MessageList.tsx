"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { splitCitations } from "@/lib/client";
import { modelLabel } from "@/lib/models";
import type { AnswerMeta, ChatMessage } from "@/lib/types";
import { useT } from "./I18nContext";

interface Props {
  messages: ChatMessage[];
  onExample: (text: string) => void;
  onShowSearch: (meta: AnswerMeta, question: string) => void;
  onOpenPdf: (ref: string, page: number) => void;
}

export default function MessageList({ messages, onExample, onShowSearch, onOpenPdf }: Props) {
  const t = useT();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="text-xs font-bold tracking-[0.35em] text-indigo-400">MITHPASONG</div>
        <h1 className="mt-2 text-2xl font-bold text-white">{t.hero.title}</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">{t.hero.description}</p>
        <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {t.hero.examples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onExample(q)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-300 transition hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-indigo-100"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-500 px-4 py-2.5 text-sm text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              question={messages[i - 1]?.content ?? ""}
              hasHistory={i > 1}
              onShowSearch={onShowSearch}
              onOpenPdf={onOpenPdf}
            />
          ),
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  question,
  hasHistory,
  onShowSearch,
  onOpenPdf,
}: {
  message: ChatMessage;
  question: string;
  hasHistory: boolean;
  onShowSearch: (meta: AnswerMeta, question: string) => void;
  onOpenPdf: (ref: string, page: number) => void;
}) {
  const t = useT();
  const meta = message.meta;
  const { body, citations } = splitCitations(message.content, meta?.hits ?? []);
  // 앞 대화가 있을 때만 "대화를 반영해 다시 쓴 질문"을 보여준다. (첫 질문은 표현만 다듬어진 경우라 의미가 없다)
  const rewritten =
    hasHistory && meta?.standaloneQuestion && meta.standaloneQuestion !== question ? meta.standaloneQuestion : null;

  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-500/15 text-xs font-bold text-indigo-300 ring-1 ring-indigo-400/30">
        M
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-300">{t.message.assistant}</span>
          {message.model && <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-400">{modelLabel(message.model)}</span>}
          {meta?.category === "off_topic" && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">{t.message.offTopic}</span>
          )}
        </div>

        {rewritten && (
          <div className="mb-2 text-[11px] text-slate-500">
            💬 {t.message.rewritten} <span className="text-slate-300">“{rewritten}”</span>
          </div>
        )}

        <div
          className={`answer rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed ${
            message.error ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-white/10 bg-white/[0.04] text-slate-200"
          }`}
        >
          {body ? (
            <ReactMarkdown>{body}</ReactMarkdown>
          ) : (
            <span className="flex items-center gap-2 text-slate-500">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:240ms]" />
              </span>
              {meta ? t.message.writing : t.message.searching}
            </span>
          )}
        </div>

        {(citations.length > 0 || (meta && meta.hits.length > 0)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {citations.length > 0 && <span className="text-[11px] text-slate-500">{t.message.sources}</span>}
            {citations.map((c) =>
              c.page ? (
                <button
                  key={c.ref}
                  type="button"
                  onClick={() => onOpenPdf(c.ref, c.page!)}
                  className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] text-indigo-200 hover:bg-indigo-500/20"
                >
                  {c.ref} · p.{c.page}
                </button>
              ) : (
                <span key={c.ref} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-slate-400">
                  {c.ref}
                </span>
              ),
            )}
            {meta && meta.hits.length > 0 && (
              <button
                type="button"
                onClick={() => onShowSearch(meta, question)}
                className="rounded-full px-2.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                {t.message.show3d}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
