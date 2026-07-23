"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CREWMATE_COLORS } from "@/lib/crewmates";
import type { RouletteGame } from "@/lib/types";

const SPIN_MS = 8000; // 원판 회전 시간
const SPINS = 8; // 최소 회전 바퀴 수

/**
 * 감속 이징 (마찰 감속 = 처음 빠르게 → 점점 느리게 → 정지).
 * 마찰 토크가 일정하면 각속도가 선형 감소하므로 회전각은 감속형 곡선이 된다.
 * 5제곱 ease-out 으로 초반은 빠르고 후반은 부드럽게 미끄러지듯 멈춘다.
 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 5);

const CONFETTI_COLORS = ["#4f46e5", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#3b82f6"];

const CX = 110;
const CY = 110;
const R = 100;

/** 각도(위쪽 12시 기준, 시계방향)에서 원 위의 좌표 */
function point(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + R * Math.sin(rad), CY - R * Math.cos(rad)];
}

/**
 * 룰렛 결과 발표 오버레이 (어몽어스풍).
 * 원판이 빙글 돌아 서버가 정한 당첨 항목에 멈추고, 색종이와 함께 당첨을 공개한다.
 */
export default function RouletteReveal({
  game,
  onClose,
}: {
  game: RouletteGame;
  onClose: () => void;
}) {
  const n = game.options.length;
  const seg = 360 / n;
  const winner = game.winnerIndex ?? 0;

  // 당첨 항목 중심이 12시(포인터)에 오도록 회전각 계산 + 여러 바퀴
  const finalRotation = useMemo(
    () => 360 * SPINS - (winner * seg + seg / 2),
    [winner, seg]
  );

  const [rotation, setRotation] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);

  // 매 프레임 감속 이징으로 회전 (CSS 트랜지션 대신 rAF 로 속도 곡선 제어)
  useEffect(() => {
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / SPIN_MS);
      setRotation(finalRotation * easeOut(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDone(true);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [finalRotation]);

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

  return (
    <div className="reveal-fade fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-900 p-6 text-white">
      {/* 색종이 (결과 공개 시) */}
      {done && (
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
      )}

      <p className="z-10 mb-1 text-sm font-medium text-amber-300">🎡 룰렛</p>
      <h2 className="z-10 mb-5 text-center text-xl font-bold">{game.title}</h2>

      {/* 원판 + 포인터 */}
      <div className="relative z-10 mb-6" style={{ width: 240, height: 240 }}>
        {/* 상단 포인터 (아래를 가리키는 삼각형) */}
        <div
          className="absolute left-1/2 top-0 z-20 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "13px solid transparent",
            borderRight: "13px solid transparent",
            borderTop: "22px solid #fbbf24",
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
          }}
          aria-hidden
        />
        <svg
          viewBox="0 0 220 220"
          width={240}
          height={240}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "50% 50%",
          }}
        >
          {game.options.map((label, i) => {
            const a0 = i * seg;
            const a1 = (i + 1) * seg;
            const [x0, y0] = point(a0);
            const [x1, y1] = point(a1);
            const largeArc = a1 - a0 > 180 ? 1 : 0;
            const color = CREWMATE_COLORS[i % CREWMATE_COLORS.length];
            const mid = a0 + seg / 2;
            const [lx, ly] = ((): [number, number] => {
              const rad = (mid * Math.PI) / 180;
              const lr = R * 0.62;
              return [CX + lr * Math.sin(rad), CY - lr * Math.cos(rad)];
            })();
            return (
              <g key={i}>
                <path
                  d={`M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`}
                  fill={color.hex}
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth={1.5}
                />
                <text
                  x={lx}
                  y={ly}
                  fill="#fff"
                  fontSize={n > 8 ? 9 : 12}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid} ${lx} ${ly})`}
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}
                >
                  {label.length > 8 ? `${label.slice(0, 7)}…` : label}
                </text>
              </g>
            );
          })}
          {/* 가운데 허브 */}
          <circle cx={CX} cy={CY} r={16} fill="#0b0e1a" stroke="#fbbf24" strokeWidth={3} />
        </svg>
      </div>

      {/* 결과 */}
      <div className="z-10 h-24 text-center">
        {done ? (
          <div className="reveal-pop">
            <p className="text-sm text-white/60">🎉 당첨!</p>
            <p className="mt-1 text-3xl font-extrabold text-amber-300">
              👑 {game.options[winner]}
            </p>
          </div>
        ) : (
          <p className="animate-pulse text-lg font-semibold text-white/80">두구두구두구…</p>
        )}
      </div>

      {done && (
        <button
          onClick={onClose}
          className="z-10 mt-2 rounded-xl bg-white/15 px-8 py-3 font-semibold text-white backdrop-blur active:bg-white/25"
        >
          닫기
        </button>
      )}
    </div>
  );
}
