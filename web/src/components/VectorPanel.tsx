"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { GROUPS } from "@/lib/groups";
import type { AnswerMeta, MapPoint, VectorMap } from "@/lib/types";
import { useT } from "./I18nContext";
import type { CameraMode } from "./VectorScene";

// three.js는 브라우저(WebGL)에서만 동작하고 용량이 커서 따로 불러온다.
const VectorScene = dynamic(() => import("./VectorScene"), {
  ssr: false,
  loading: () => <SceneLoading />,
});

function SceneLoading() {
  const t = useT();
  return <div className="grid h-full place-items-center text-sm text-slate-500">{t.vector.loading}</div>;
}

interface Props {
  selected: { meta: AnswerMeta; question: string } | null;
  focusRef: string | null;
  onFocus: (ref: string) => void;
  onOpenPdf: (ref: string, page: number) => void;
}

export default function VectorPanel({ selected, focusRef, onFocus, onOpenPdf }: Props) {
  const t = useT();
  const [map, setMap] = useState<VectorMap | null>(null);
  // 사용자가 버튼으로 고른 카메라 모드. 새 질문이 들어오면 다시 질문 위치(focus)부터 보여준다.
  const [cameraChoice, setCameraChoice] = useState<{ queryKey: string; mode: CameraMode } | null>(null);

  useEffect(() => {
    fetch("/vector-map.json")
      .then((res) => res.json())
      .then(setMap)
      .catch(() => setMap({ explainedVariance: [], points: [] }));
  }, []);

  const meta = selected?.meta ?? null;
  const queryKey = meta?.queryPosition?.join(",") ?? "";
  const cameraMode: CameraMode = cameraChoice?.queryKey === queryKey ? cameraChoice.mode : "focus";
  const explained = map ? map.explainedVariance.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex h-full flex-col bg-[#070b16] text-slate-100">
      <div className="relative min-h-0 flex-1">
        {map && (
          <VectorScene
            points={map.points}
            meta={meta}
            focusRef={focusRef}
            cameraMode={cameraMode}
            onPointClick={(p: MapPoint) => onOpenPdf(p.ref, p.pages[0])}
          />
        )}

        <div className="pointer-events-none absolute left-3 top-3 max-w-[65%] space-y-1">
          <div className="text-xs font-semibold text-slate-200">{t.vector.title(map?.points.length ?? 0)}</div>
          {selected ? (
            <div className="line-clamp-2 text-[11px] text-amber-200">🔎 {meta?.standaloneQuestion ?? selected.question}</div>
          ) : (
            <div className="text-[11px] text-slate-400">{t.vector.idle}</div>
          )}
        </div>

        {meta?.queryPosition && (
          <button
            type="button"
            onClick={() => setCameraChoice({ queryKey, mode: cameraMode === "focus" ? "overview" : "focus" })}
            className="absolute right-3 top-3 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur transition hover:border-indigo-400/60 hover:bg-slate-800"
          >
            {cameraMode === "focus" ? t.vector.overview : t.vector.focus}
          </button>
        )}

        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1">
          {GROUPS.map((g) => (
            <span key={g.key} className="flex items-center gap-1 text-[10px] text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
              {t.groups[g.key]}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        {meta && meta.hits.length > 0 ? (
          <ol className="space-y-1.5">
            {meta.hits.map((hit, i) => (
              <li key={hit.id}>
                <div
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition ${
                    focusRef === hit.ref ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <button type="button" onClick={() => onFocus(hit.ref)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="w-8 shrink-0 text-slate-400">{hit.followed ? t.vector.ref : `#${i + 1}`}</span>
                    <span className="w-36 shrink-0 truncate font-medium">{hit.ref}</span>
                    {hit.similarity !== null ? (
                      <span className="flex flex-1 items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-amber-300" style={{ width: `${hit.similarity * 100}%` }} />
                        </span>
                        <span className="w-10 text-right tabular-nums text-amber-200">{hit.similarity.toFixed(3)}</span>
                      </span>
                    ) : (
                      <span className="flex-1 truncate text-[11px] text-violet-300">{t.vector.followed}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPdf(hit.ref, hit.pages[0])}
                    className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                  >
                    PDF p.{hit.pages[0]}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-slate-400">{t.vector.hint}</p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{t.vector.caption((explained * 100).toFixed(1))}</p>
      </div>
    </div>
  );
}
