"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Vote } from "@/lib/types";

const DRUMROLL_MS = 1600; // 드럼롤 서스펜스 시간
const COUNT_MS = 1100; // 막대 차오름 + 숫자 카운트업 시간
const CONFETTI_COLORS = ["#4f46e5", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#3b82f6"];

type Phase = "drumroll" | "reveal";

/**
 * 투표 종료 시 등장하는 전체화면 결과 발표 오버레이.
 * 드럼롤 → 막대 차오름/숫자 카운트업 → 1위 왕관 + 색종이 연출.
 */
export default function ResultReveal({
  vote,
  onClose,
}: {
  vote: Vote;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("drumroll");
  const [t, setT] = useState(0); // 0→1 진행도 (막대/숫자 애니메이션)

  const total = useMemo(
    () => Object.values(vote.results).reduce((a, b) => a + b, 0),
    [vote]
  );
  const maxCount = useMemo(
    () => Math.max(0, ...Object.values(vote.results)),
    [vote]
  );

  // 후보를 득표순 정렬 (발표 느낌)
  const ranked = useMemo(
    () =>
      [...vote.options].sort(
        (a, b) => (vote.results[b.id] ?? 0) - (vote.results[a.id] ?? 0)
      ),
    [vote]
  );

  // 색종이 조각 (한 번만 생성)
  const confetti = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    []
  );

  // 드럼롤 → 공개 전환
  useEffect(() => {
    const timer = setTimeout(() => setPhase("reveal"), DRUMROLL_MS);
    return () => clearTimeout(timer);
  }, []);

  // 공개 단계에서 0→1 진행도 애니메이션 (requestAnimationFrame)
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "reveal") return;
    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const p = Math.min(1, (now - startRef.current) / COUNT_MS);
      setT(p);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  return (
    <div className="reveal-fade fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-900 p-6 text-white">
      {phase === "drumroll" ? (
        // ── 드럼롤 서스펜스 ──────────────────────────────
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="drum-pulse text-6xl">🥁</div>
          <p className="text-lg font-semibold">곧 결과가 발표됩니다...</p>
          <p className="text-sm text-white/60">두구두구두구</p>
        </div>
      ) : (
        // ── 결과 공개 ──────────────────────────────
        <>
          {/* 색종이 */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {confetti.map((c, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{
                  left: `${c.left}%`,
                  backgroundColor: c.color,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  transform: `rotate(${c.rotate}deg)`,
                }}
              />
            ))}
          </div>

          <div className="reveal-pop z-10 w-full max-w-md">
            <p className="mb-1 text-center text-sm font-medium text-amber-300">
              🎉 최종 결과 발표
            </p>
            <h2 className="mb-6 text-center text-2xl font-bold">{vote.title}</h2>

            <div className="space-y-4">
              {ranked.map((opt) => {
                const count = vote.results[opt.id] ?? 0;
                const pct = total === 0 ? 0 : (count / total) * 100;
                // 동률이면 최다 득표를 공유하는 모든 후보에게 왕관
                const isWinner = count > 0 && count === maxCount;
                const shownCount = Math.round(count * t);
                const shownPct = Math.round(pct * t);
                return (
                  <div key={opt.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`font-semibold ${
                          isWinner ? "text-amber-300" : "text-white/90"
                        }`}
                      >
                        {isWinner && (
                          <span className="crown-bounce mr-1 inline-block">👑</span>
                        )}
                        {opt.label}
                      </span>
                      <span className="tabular-nums text-sm text-white/70">
                        {shownCount}표 ({shownPct}%)
                      </span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-white/15">
                      <div
                        className={`h-full rounded-full ${
                          isWinner ? "bg-amber-400" : "bg-indigo-400"
                        }`}
                        style={{ width: `${pct * t}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-center text-xs text-white/50">총 {total}표</p>

            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-white/15 py-3 font-semibold text-white backdrop-blur active:bg-white/25"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
