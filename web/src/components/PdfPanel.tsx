"use client";

import { PDF_URL } from "@/lib/client";
import { useT } from "./I18nContext";

export default function PdfPanel({ page, label }: { page: number; label: string | null }) {
  const t = useT();
  const src = `${PDF_URL}#page=${page}`;
  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-2 text-xs text-slate-400">
        <span>
          {t.pdf.name} · <b className="text-slate-100">p.{page}</b>
          {label && <span className="ml-2 rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-300">{label}</span>}
        </span>
        <a href={src} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">
          {t.pdf.openNewTab}
        </a>
      </div>
      {/* key가 바뀌면 iframe을 새로 그려서 해당 페이지로 이동한다. */}
      <iframe key={page} src={src} title={t.pdf.name} className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}
