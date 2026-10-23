"use client";

import type { ConversationSummary } from "@/lib/types";
import { useT } from "./I18nContext";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function Sidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  const t = useT();
  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-slate-950 text-slate-200">
      <div className="px-4 pb-3 pt-4">
        <div className="text-[11px] font-bold tracking-[0.3em] text-indigo-400">MITHPASONG</div>
        <div className="text-sm font-semibold text-white">{t.appName}</div>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-lg border border-white/15 px-3 py-2 text-left text-sm transition hover:border-indigo-400/50 hover:bg-white/5"
        >
          {t.sidebar.newChat}
        </button>
      </div>

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
        {conversations.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">{t.sidebar.empty}</p>}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center rounded-lg ${c.id === activeId ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
              <div className="truncate text-sm">{c.title}</div>
              <div className="text-[10px] text-slate-500">{formatDate(c.updated_at, t.dateLocale)}</div>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(t.sidebar.deleteConfirm)) onDelete(c.id);
              }}
              className="mr-2 hidden rounded px-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-rose-300 group-hover:block"
              aria-label={t.sidebar.deleteLabel}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>

      <p className="border-t border-white/10 px-4 py-3 text-[10px] leading-relaxed text-slate-500">{t.sidebar.anonymousNote}</p>
    </div>
  );
}
