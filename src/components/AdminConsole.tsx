"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { Vote } from "@/lib/types";
import VoteResult from "@/components/VoteResult";

/**
 * 관리자 콘솔 (클라이언트).
 * URL 의 비밀 slug 를 그대로 관리자 인증 토큰(adminKey)으로 사용한다.
 * → 비밀 URL 을 아는 사람만 화면 접근 + 관리자 기능 실행 가능.
 */
export default function AdminConsole({ slug }: { slug: string }) {
  const [userCount, setUserCount] = useState(0);
  const [vote, setVote] = useState<Vote | null>(null);

  // 투표 생성 폼 상태
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  useEffect(() => {
    const socket = getSocket();

    // 관리자 room 참여 → 진행 중에도 실시간 집계 수신 (연결 상태와 무관하게 즉시/재연결 시 모두)
    const joinAdmin = () => socket.emit("admin:hello", { adminKey: slug });
    joinAdmin();
    socket.on("connect", joinAdmin);

    socket.on("state:sync", (snap) => {
      setUserCount(snap.userCount);
      setVote(snap.currentVote);
    });
    socket.on("users:update", (count) => setUserCount(count));
    socket.on("vote:update", (v) => setVote(v));
    socket.on("error:msg", (m) => alert(m));

    return () => {
      socket.off("connect", joinAdmin);
      socket.off("state:sync");
      socket.off("users:update");
      socket.off("vote:update");
      socket.off("error:msg");
    };
  }, [slug]);

  const updateOption = (i: number, val: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)));
  };
  const addOption = () => setOptions((prev) => [...prev, ""]);
  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = () => {
    getSocket().emit("admin:vote:create", { title, options, adminKey: slug });
    setTitle("");
    setOptions(["", ""]);
  };

  const handleClose = () => {
    if (confirm("투표를 종료할까요?")) {
      getSocket().emit("admin:vote:close", { adminKey: slug });
    }
  };

  const handleReset = () => {
    if (confirm("현재 투표를 초기화하고 다음 투표를 준비할까요?")) {
      getSocket().emit("admin:vote:reset", { adminKey: slug });
    }
  };

  const handleResetAll = () => {
    if (
      confirm(
        "전체 초기화하시겠어요?\n현재 투표는 물론 사용자 화면의 '지난 투표 결과'까지 모두 삭제됩니다. (되돌릴 수 없음)"
      )
    ) {
      getSocket().emit("admin:reset:all", { adminKey: slug });
    }
  };

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg space-y-4 p-4">
      <header className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-white">
        <span className="font-bold">🛠️ 관리자 콘솔</span>
        <span className="text-sm opacity-90">👥 {userCount}명 접속</span>
      </header>

      {/* 현재 투표 상태 / 컨트롤 */}
      {vote ? (
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{vote.title}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                vote.status === "OPEN"
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {vote.status === "OPEN" ? "진행 중" : "종료됨"}
            </span>
          </div>

          <VoteResult vote={vote} />

          <div className="mt-4 flex gap-2">
            {vote.status === "OPEN" ? (
              <button
                onClick={handleClose}
                className="flex-1 rounded-xl bg-red-500 py-3 font-semibold text-white active:bg-red-600"
              >
                투표 종료
              </button>
            ) : (
              <button
                onClick={handleReset}
                className="flex-1 rounded-xl bg-slate-600 py-3 font-semibold text-white active:bg-slate-700"
              >
                새 투표 준비
              </button>
            )}
          </div>
        </div>
      ) : (
        // 투표 생성 폼
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-3 font-bold">새 투표 만들기</h2>
          <input
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
            placeholder="투표 제목 (예: 베스트 조 투표)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
                  placeholder={`후보 ${i + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(i)}
                    className="rounded-lg bg-slate-200 px-3 text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addOption}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500"
          >
            + 후보 추가
          </button>
          <button
            onClick={handleCreate}
            className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white active:bg-brand-dark"
          >
            투표 생성 & 시작
          </button>
        </div>
      )}

      {/* 위험 구역: 전체 초기화 (지난 결과 히스토리까지 삭제) */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="mb-2 text-xs font-medium text-red-700">위험 구역</p>
        <button
          onClick={handleResetAll}
          className="w-full rounded-xl border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-600 active:bg-red-100"
        >
          🧹 전체 초기화 (지난 결과까지 삭제)
        </button>
        <p className="mt-2 text-xs text-red-500/80">
          사용자 화면의 &lsquo;지난 투표 결과&rsquo; 배너가 사라집니다. 되돌릴 수 없어요.
        </p>
      </div>
    </main>
  );
}
