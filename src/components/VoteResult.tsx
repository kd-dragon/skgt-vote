"use client";

import type { Vote } from "@/lib/types";

/** 투표 현황/결과를 막대그래프로 표시하는 공용 컴포넌트 */
export default function VoteResult({ vote }: { vote: Vote }) {
  const total = Object.values(vote.results).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...Object.values(vote.results));

  return (
    <div className="space-y-3">
      {vote.options.map((opt) => {
        const count = vote.results[opt.id] ?? 0;
        const pct = total === 0 ? 0 : Math.round((count / total) * 100);
        const isLeader = vote.status === "CLOSED" && count === maxCount && count > 0;
        return (
          <div key={opt.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className={isLeader ? "font-bold text-brand" : "font-medium"}>
                {isLeader && "👑 "}
                {opt.label}
              </span>
              <span className="tabular-nums text-slate-500">
                {count}표 ({pct}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isLeader ? "bg-brand" : "bg-brand/60"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-right text-xs text-slate-400">총 {total}표</p>
    </div>
  );
}
