"use client";

import { useState } from "react";
import { isKoreanQuestion } from "@/lib/i18n";
import { CHAT_MODELS, type ChatModelId } from "@/lib/models";
import { useT } from "./I18nContext";

const MAX_LENGTH = 500;

interface Props {
  model: ChatModelId;
  onModelChange: (model: ChatModelId) => void;
  onSend: (text: string) => void;
  busy: boolean;
}

export default function Composer({ model, onModelChange, onSend, busy }: Props) {
  const t = useT();
  const [text, setText] = useState("");

  const value = text.trim();
  const notKorean = value.length > 0 && !isKoreanQuestion(value);
  const tooLong = text.length > MAX_LENGTH;
  const canSend = value.length > 0 && !busy && !tooLong && !notKorean;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="border-t border-white/10 bg-slate-950 px-4 pb-4 pt-3">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-slate-500">{t.composer.model}</span>
          <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
            {CHAT_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                title={t.composer.modelDescriptions[m.id]}
                onClick={() => onModelChange(m.id)}
                className={`rounded-md px-2.5 py-1 transition ${
                  model === m.id ? "bg-indigo-500/20 font-semibold text-indigo-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="hidden text-slate-500 sm:inline">{t.composer.modelDescriptions[model]}</span>
        </div>

        <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-slate-900 px-3 py-2 focus-within:border-indigo-400/70 focus-within:ring-2 focus-within:ring-indigo-500/20">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합 중에 Enter가 눌린 경우는 무시해야 마지막 글자가 두 번 전송되지 않는다.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(5, Math.max(1, text.split("\n").length))}
            placeholder={t.composer.placeholder}
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            {busy ? t.composer.sending : t.composer.send}
          </button>
        </div>
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-rose-400">{notKorean ? t.composer.koreanOnly : ""}</span>
          <span className={tooLong ? "text-rose-400" : "text-slate-500"}>
            {text.length}/{MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
