"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CREWMATE_COLORS } from "@/lib/crewmates";
import type { LadderGame } from "@/lib/types";

const DESCEND_MS = 2200; // 토큰 한 명이 내려가는 시간

// 사다리 도형 좌표 (SVG 뷰박스 기준)
const MARGIN_X = 30;
const GAP_X = 56;
const TOP_Y = 44;
const BOTTOM_Y = 210;
const NAME_Y = 24;
const PRIZE_TOP = BOTTOM_Y + 8;
const PRIZE_H = 30;
const SVG_H = PRIZE_TOP + PRIZE_H + 8;

type Pt = { x: number; y: number };

/**
 * 사용자용 사다리 보드 (인페이지, 관전).
 * - 사다리 길(세로줄+가로대)은 보이고, 하단 결과는 ❓로 가려짐.
 * - 관리자가 참가자를 하나씩 공개(game.revealed)하면 해당 크루원 토큰이 내려간다.
 */
export default function LadderBoard({ game }: { game: LadderGame }) {
  const cols = game.players.length;
  const svgW = MARGIN_X * 2 + Math.max(1, cols - 1) * GAP_X;

  const colX = (col: number) => MARGIN_X + col * GAP_X;
  const rungY = (row: number) => TOP_Y + ((row + 0.5) / game.rows) * (BOTTOM_Y - TOP_Y);

  const byRow = useMemo(() => {
    const arr: Set<number>[] = Array.from({ length: game.rows }, () => new Set<number>());
    game.rungs.forEach((r) => arr[r.row]?.add(r.col));
    return arr;
  }, [game.rungs, game.rows]);

  // 각 참가자의 내려가는 경로 폴리라인 + 도착 열 + 누적 길이
  const paths = useMemo(() => {
    return game.players.map((_, start) => {
      const pts: Pt[] = [{ x: colX(start), y: TOP_Y }];
      let pos = start;
      for (let row = 0; row < game.rows; row++) {
        const y = rungY(row);
        pts.push({ x: colX(pos), y });
        if (byRow[row].has(pos)) {
          pos += 1;
          pts.push({ x: colX(pos), y });
        } else if (byRow[row].has(pos - 1)) {
          pos -= 1;
          pts.push({ x: colX(pos), y });
        }
      }
      pts.push({ x: colX(pos), y: BOTTOM_Y });
      const seg: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        seg.push(d);
        total += d;
      }
      return { pts, seg, total, end: pos };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.players.length, game.rows, byRow]);

  const endOf = (i: number) => game.mapping?.[i] ?? paths[i]?.end ?? i;

  // ── 공개 애니메이션 큐 ──────────────────────────────
  const [settled, setSettled] = useState<number[]>([]);
  const [anim, setAnim] = useState<{ index: number; t: number } | null>(null);
  const settledRef = useRef<number[]>([]);
  const queueRef = useRef<number[]>([]);
  const processingRef = useRef(false);
  const initedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // 최초 마운트: 이미 공개된 참가자는 애니메이션 없이 즉시 도착 처리(재접속 대비)
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    settledRef.current = [...game.revealed];
    setSettled([...game.revealed]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새로 공개된 참가자를 큐에 넣고 순차 애니메이션
  useEffect(() => {
    if (!initedRef.current) return;
    game.revealed.forEach((idx) => {
      if (
        !settledRef.current.includes(idx) &&
        !queueRef.current.includes(idx) &&
        anim?.index !== idx
      ) {
        queueRef.current.push(idx);
      }
    });
    if (!processingRef.current) startNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.revealed]);

  const startNext = () => {
    const next = queueRef.current.shift();
    if (next === undefined) {
      processingRef.current = false;
      return;
    }
    processingRef.current = true;
    setAnim({ index: next, t: 0 });
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DESCEND_MS);
      setAnim({ index: next, t });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        settledRef.current = [...settledRef.current, next];
        setSettled([...settledRef.current]);
        setAnim(null);
        startNext();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // 진행도 t 에서 경로 위 좌표
  const posAt = (index: number, t: number): Pt => {
    const p = paths[index];
    if (!p || p.total === 0) return p?.pts[0] ?? { x: colX(index), y: TOP_Y };
    let dist = t * p.total;
    for (let i = 0; i < p.seg.length; i++) {
      if (dist <= p.seg[i]) {
        const r = p.seg[i] === 0 ? 0 : dist / p.seg[i];
        return {
          x: p.pts[i].x + (p.pts[i + 1].x - p.pts[i].x) * r,
          y: p.pts[i].y + (p.pts[i + 1].y - p.pts[i].y) * r,
        };
      }
      dist -= p.seg[i];
    }
    return p.pts[p.pts.length - 1];
  };

  const short = (s: string, n = 6) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  // 결과칸 공개 여부: 도착 완료한 참가자가 매핑된 결과만 공개
  const prizeShown = (prizeIndex: number) =>
    settled.some((i) => endOf(i) === prizeIndex);

  // 강조 경로(도착 완료 + 진행 중) 폴리라인 문자열
  const pathPolyline = (index: number, upto?: number): string => {
    const p = paths[index];
    if (!p) return "";
    if (upto === undefined) return p.pts.map((pt) => `${pt.x},${pt.y}`).join(" ");
    // 진행 중: 시작~현재 위치까지만
    const cur = posAt(index, upto);
    const out: string[] = [];
    let acc = 0;
    const target = upto * p.total;
    out.push(`${p.pts[0].x},${p.pts[0].y}`);
    for (let i = 1; i < p.pts.length; i++) {
      const d = p.seg[i - 1];
      if (acc + d < target) {
        out.push(`${p.pts[i].x},${p.pts[i].y}`);
        acc += d;
      } else break;
    }
    out.push(`${cur.x},${cur.y}`);
    return out.join(" ");
  };

  return (
    <svg viewBox={`0 0 ${svgW} ${SVG_H}`} className="w-full" style={{ maxHeight: "56vh" }}>
      {/* 세로줄 */}
      {game.players.map((_, c) => (
        <line
          key={`v${c}`}
          x1={colX(c)}
          y1={TOP_Y}
          x2={colX(c)}
          y2={BOTTOM_Y}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      {/* 가로대 (사다리 길 — 보임) */}
      {game.rungs.map((r, i) => (
        <line
          key={`h${i}`}
          x1={colX(r.col)}
          y1={rungY(r.row)}
          x2={colX(r.col + 1)}
          y2={rungY(r.row)}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}

      {/* 도착 완료한 참가자 경로 강조 */}
      {settled.map((i) => (
        <polyline
          key={`path${i}`}
          points={pathPolyline(i)}
          fill="none"
          stroke={CREWMATE_COLORS[i % CREWMATE_COLORS.length].hex}
          strokeWidth={3.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
      ))}
      {/* 진행 중 참가자 경로(부분) 강조 */}
      {anim && (
        <polyline
          points={pathPolyline(anim.index, anim.t)}
          fill="none"
          stroke={CREWMATE_COLORS[anim.index % CREWMATE_COLORS.length].hex}
          strokeWidth={3.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* 상단 참가자 이름 */}
      {game.players.map((p, c) => (
        <text
          key={`nm${c}`}
          x={colX(c)}
          y={NAME_Y}
          fill={p.trim() ? "#e5edfb" : "#64748b"}
          fontSize={11}
          fontWeight={700}
          textAnchor="middle"
        >
          {p.trim() ? short(p) : "?"}
        </text>
      ))}

      {/* 하단 결과칸 (항상 보임 · 도착한 칸은 강조) */}
      {game.prizes.map((prize, c) => {
        const reached = prizeShown(c);
        return (
          <g key={`pz${c}`}>
            <rect
              x={colX(c) - GAP_X / 2 + 4}
              y={PRIZE_TOP}
              width={GAP_X - 8}
              height={PRIZE_H}
              rx={7}
              fill={reached ? "#fbbf24" : "rgba(255,255,255,0.1)"}
              stroke={reached ? "#f59e0b" : "rgba(255,255,255,0.25)"}
              strokeWidth={1.5}
            />
            <text
              x={colX(c)}
              y={PRIZE_TOP + PRIZE_H / 2}
              fill={reached ? "#1e293b" : "#e5edfb"}
              fontSize={11}
              fontWeight={800}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {short(prize, 6)}
            </text>
          </g>
        );
      })}

      {/* 크루원 토큰: 도착 완료(하단 고정) */}
      {settled.map((i) => {
        const color = CREWMATE_COLORS[i % CREWMATE_COLORS.length];
        return (
          <g key={`tok${i}`} transform={`translate(${colX(endOf(i))} ${BOTTOM_Y})`}>
            <ellipse cx={0} cy={0} rx={8} ry={10} fill={color.hex} stroke={color.shade} strokeWidth={2} />
            <rect x={-2.5} y={-4} width={8} height={5} rx={2.5} fill="#9BD2E8" />
          </g>
        );
      })}
      {/* 진행 중 토큰 */}
      {anim && (() => {
        const { x, y } = posAt(anim.index, anim.t);
        const color = CREWMATE_COLORS[anim.index % CREWMATE_COLORS.length];
        return (
          <g transform={`translate(${x} ${y})`}>
            <ellipse cx={0} cy={0} rx={9} ry={11} fill={color.hex} stroke={color.shade} strokeWidth={2} />
            <rect x={-3} y={-5} width={9} height={6} rx={3} fill="#9BD2E8" />
          </g>
        );
      })()}

      {/* 중간 가림막 (대기 중에만 표시 · 하나씩 공개 시작하면 치움) */}
      {game.status === "OPEN" && (() => {
        const y1 = TOP_Y + (BOTTOM_Y - TOP_Y) * 0.28;
        const y2 = TOP_Y + (BOTTOM_Y - TOP_Y) * 0.72;
        return (
          <g>
            <rect
              x={6}
              y={y1}
              width={svgW - 12}
              height={y2 - y1}
              rx={10}
              fill="#232a3d"
              stroke="#475569"
              strokeWidth={2}
            />
            <rect
              x={12}
              y={y1 + 6}
              width={svgW - 24}
              height={y2 - y1 - 12}
              rx={7}
              fill="none"
              stroke="rgba(148,163,184,0.45)"
              strokeDasharray="6 5"
              strokeWidth={1.5}
            />
            <text
              x={svgW / 2}
              y={(y1 + y2) / 2}
              fill="#cbd5e1"
              fontSize={14}
              fontWeight={800}
              textAnchor="middle"
              dominantBaseline="central"
            >
              🚧 가림막 🚧
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
