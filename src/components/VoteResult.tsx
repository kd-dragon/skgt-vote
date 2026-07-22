"use client";

import type { Vote } from "@/lib/types";

/** 투표 현황/결과를 막대그래프로 표시하는 공용 컴포넌트 */
export default function VoteResult({
  vote,
  dark = false,
}: {
  vote: Vote;
  dark?: boolean;
}) {
  const total = Object.values(vote.results).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...Object.values(vote.results));

  // 배경 톤에 따른 색상
  const subText = dark ? "text-white/60" : "text-slate-500";
  const track = dark ? "bg-white/15" : "bg-slate-200";
  const winnerText = dark ? "text-amber-300" : "text-brand";
  const winnerBar = dark ? "bg-amber-400" : "bg-brand";
  const normalText = dark ? "text-white/90" : "text-slate-800";
  const normalBar = dark ? "bg-indigo-400" : "bg-brand/60";
  const totalText = dark ? "text-white/40" : "text-slate-400";

  return (
    <div className="space-y-3">
      {vote.options.map((opt) => {
        const count = vote.results[opt.id] ?? 0;
        const pct = total === 0 ? 0 : Math.round((count / total) * 100);
        const isLeader = vote.status === "CLOSED" && count === maxCount && count > 0;
        return (
          <div key={opt.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className={isLeader ? `font-bold ${winnerText}` : `font-medium ${normalText}`}>
                {isLeader && "👑 "}
                {opt.label}
              </span>
              <span className={`tabular-nums ${subText}`}>
                {count}표 ({pct}%)
              </span>
            </div>
            <div className={`h-3 w-full overflow-hidden rounded-full ${track}`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isLeader ? winnerBar : normalBar
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className={`pt-1 text-right text-xs ${totalText}`}>총 {total}표</p>
    </div>
  );
}
