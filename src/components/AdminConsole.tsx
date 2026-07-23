"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { Game, Vote } from "@/lib/types";
import VoteResult from "@/components/VoteResult";

type Mode = "VOTE" | "ROULETTE" | "LADDER";

/**
 * 관리자 콘솔 (클라이언트).
 * URL 의 비밀 slug 를 그대로 관리자 인증 토큰(adminKey)으로 사용한다.
 * → 비밀 URL 을 아는 사람만 화면 접근 + 관리자 기능 실행 가능.
 */
export default function AdminConsole({ slug }: { slug: string }) {
  const [userCount, setUserCount] = useState(0);
  const [vote, setVote] = useState<Vote | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [mode, setMode] = useState<Mode>("VOTE"); // 생성 패널 탭

  // 투표 생성 폼 상태
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  // 게임 생성 폼 상태
  const [gameTitle, setGameTitle] = useState("");
  const [rouletteItems, setRouletteItems] = useState<string[]>(["", ""]); // 룰렛 항목
  const [ladderPrizes, setLadderPrizes] = useState<string[]>(["", ""]); // 사다리 결과(생성용)
  const [ladderNames, setLadderNames] = useState<string[]>([]); // 사다리 참가자 입력(OPEN 단계)

  useEffect(() => {
    const socket = getSocket();

    // 관리자 room 참여 → 진행 중에도 실시간 집계 수신 (연결 상태와 무관하게 즉시/재연결 시 모두)
    const joinAdmin = () => socket.emit("admin:hello", { adminKey: slug });
    joinAdmin();
    socket.on("connect", joinAdmin);

    socket.on("state:sync", (snap) => {
      setUserCount(snap.userCount);
      setVote(snap.currentVote);
      setGame(snap.currentGame);
    });
    socket.on("users:update", (count) => setUserCount(count));
    socket.on("vote:update", (v) => setVote(v));
    socket.on("game:update", (g) => setGame(g));
    socket.on("error:msg", (m) => alert(m));

    return () => {
      socket.off("connect", joinAdmin);
      socket.off("state:sync");
      socket.off("users:update");
      socket.off("vote:update");
      socket.off("game:update");
      socket.off("error:msg");
    };
  }, [slug]);

  // 사다리 게임이 새로 열리면 참가자 입력칸을 결과 개수만큼 초기화(서버 값과 동기화)
  const ladderGameId = game?.type === "LADDER" ? game.id : null;
  useEffect(() => {
    if (game?.type === "LADDER") setLadderNames(game.players.map((p) => p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladderGameId]);

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

  // 종료된 투표에서 최다 득표를 공유하는(동률) 후보들. 2개 이상일 때만 동점 재투표 대상.
  const tiedOptions = (() => {
    if (!vote || vote.status !== "CLOSED") return [];
    const max = Math.max(0, ...Object.values(vote.results));
    if (max <= 0) return [];
    const tied = vote.options.filter((o) => (vote.results[o.id] ?? 0) === max);
    return tied.length >= 2 ? tied : [];
  })();

  const handleTieRevote = () => {
    if (!vote || tiedOptions.length < 2) return;
    if (
      confirm(
        `동점인 ${tiedOptions.length}개 후보로 재투표를 시작할까요?\n(${tiedOptions
          .map((o) => o.label)
          .join(", ")})`
      )
    ) {
      getSocket().emit("admin:vote:create", {
        title: `${vote.title} (재투표)`,
        options: tiedOptions.map((o) => o.label),
        adminKey: slug,
      });
    }
  };

  const handleClearChat = () => {
    if (
      confirm(
        "전체 채팅 기록을 초기화할까요?\n모든 사용자의 채팅창이 즉시 비워집니다. (되돌릴 수 없음)"
      )
    ) {
      getSocket().emit("admin:chat:clear", { adminKey: slug });
    }
  };

  // ── 게임 폼 헬퍼 ──────────────────────────────
  const setAt = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    i: number,
    val: string
  ) => setter((prev) => prev.map((o, idx) => (idx === i ? val : o)));
  const addAt = (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    setter((prev) => [...prev, ""]);
  const removeAt = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    i: number
  ) => setter((prev) => prev.filter((_, idx) => idx !== i));

  const handleRouletteCreate = () => {
    getSocket().emit("admin:game:create", {
      type: "ROULETTE",
      title: gameTitle,
      items: rouletteItems,
      adminKey: slug,
    });
    setGameTitle("");
    setRouletteItems(["", ""]);
  };

  const handleLadderCreate = () => {
    getSocket().emit("admin:game:create", {
      type: "LADDER",
      title: gameTitle,
      items: [], // 참가자는 이후 입력
      prizes: ladderPrizes,
      adminKey: slug,
    });
    setGameTitle("");
    setLadderPrizes(["", ""]);
  };

  // 사다리: 참가자 입력을 서버(보드)에 반영
  const handleLadderReflect = () => {
    getSocket().emit("admin:game:ladder:players", { players: ladderNames, adminKey: slug });
  };

  // 사다리: 게임 시작 (참가자 최신값 반영 후 시작)
  const handleLadderStart = () => {
    if (ladderNames.some((n) => !n.trim())) {
      alert("참가자를 모두 입력해 주세요.");
      return;
    }
    if (confirm("사다리 게임을 시작할까요?\n시작 후에는 참가자를 하나씩 공개합니다.")) {
      const socket = getSocket();
      socket.emit("admin:game:ladder:players", { players: ladderNames, adminKey: slug });
      socket.emit("admin:game:ladder:start", { adminKey: slug });
    }
  };

  // 사다리: 참가자 한 명 공개
  const handleLadderReveal = (index: number) => {
    getSocket().emit("admin:game:ladder:reveal", { index, adminKey: slug });
  };

  const handleRouletteRun = () => {
    if (confirm("룰렛을 돌릴까요?")) getSocket().emit("admin:game:run", { adminKey: slug });
  };

  const handleGameReset = () => {
    if (confirm("현재 게임을 초기화할까요?")) {
      getSocket().emit("admin:game:reset", { adminKey: slug });
    }
  };

  // 탭 이동: 진행 중인 투표/게임이 있으면 확인 후 종료(동시 진행 방지)
  const handleTabChange = (m: Mode) => {
    if (m === mode) return;
    if (vote || game) {
      if (
        !confirm(
          "탭을 이동하면 진행 중인 투표/게임이 종료됩니다.\n(동시 진행 방지) 계속할까요?"
        )
      ) {
        return;
      }
      const socket = getSocket();
      if (vote) socket.emit("admin:vote:reset", { adminKey: slug });
      if (game) socket.emit("admin:game:reset", { adminKey: slug });
    }
    setMode(m);
  };

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg space-y-4 p-4">
      <header className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-white">
        <span className="font-bold">🛠️ 관리자 콘솔</span>
        <span className="text-sm opacity-90">👥 {userCount}명 접속</span>
      </header>

      {/* 모드 탭 (생성 패널 전환) */}
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
        {(
          [
            ["VOTE", "🗳️ 투표"],
            ["ROULETTE", "🎡 룰렛"],
            ["LADDER", "🪜 사다리"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => handleTabChange(m)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 현재 투표 상태 / 컨트롤 */}
      {vote && (
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
              <>
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-xl bg-slate-600 py-3 font-semibold text-white active:bg-slate-700"
                >
                  새 투표 준비
                </button>
                {tiedOptions.length >= 2 && (
                  <button
                    onClick={handleTieRevote}
                    className="flex-1 rounded-xl bg-amber-500 py-3 font-semibold text-white active:bg-amber-600"
                  >
                    👑 동점 재투표
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 투표 생성 폼 (탭=투표 & 진행 중 투표 없음) */}
      {!vote && mode === "VOTE" && (
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

      {/* 현재 게임 상태 / 컨트롤 */}
      {game && (
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">
              {game.type === "ROULETTE" ? "🎡 " : "🪜 "}
              {game.title}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                game.status === "OPEN"
                  ? "bg-amber-100 text-amber-700"
                  : game.status === "PLAYING"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {game.status === "OPEN"
                ? "대기 중"
                : game.status === "PLAYING"
                  ? "진행 중"
                  : "결과 발표됨"}
            </span>
          </div>

          {/* ── 룰렛 컨트롤 ── */}
          {game.type === "ROULETTE" && (
            <>
              <p className="mb-3 text-sm text-slate-600">항목: {game.options.join(", ")}</p>
              {game.status === "RESULT" && (
                <p className="mb-3 text-sm font-bold text-amber-600">
                  👑 당첨: {game.options[game.winnerIndex ?? 0]}
                </p>
              )}
              <div className="flex gap-2">
                {game.status === "OPEN" && (
                  <button
                    onClick={handleRouletteRun}
                    className="flex-1 rounded-xl bg-amber-500 py-3 font-semibold text-white active:bg-amber-600"
                  >
                    🎡 돌리기
                  </button>
                )}
                <button
                  onClick={handleGameReset}
                  className="flex-1 rounded-xl bg-slate-600 py-3 font-semibold text-white active:bg-slate-700"
                >
                  게임 초기화
                </button>
              </div>
            </>
          )}

          {/* ── 사다리 컨트롤 ── */}
          {game.type === "LADDER" && (
            <>
              <p className="mb-2 text-sm text-slate-600">
                결과: {game.prizes.join(", ")}{" "}
                <span className="text-slate-400">(사다리 중간은 가림막으로 가려짐)</span>
              </p>

              {game.status === "OPEN" ? (
                // 참가자 입력 단계
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    참가자 입력 (구두로 받은 위치대로 · {game.prizes.length}명)
                  </p>
                  <div className="space-y-2">
                    {ladderNames.map((name, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-400">
                          {i + 1}
                        </span>
                        <input
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
                          placeholder={`참가자 ${i + 1}`}
                          value={name}
                          maxLength={20}
                          onChange={(e) => setAt(setLadderNames, i, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleLadderReflect}
                      className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-100"
                    >
                      보드에 반영
                    </button>
                    <button
                      onClick={handleLadderStart}
                      className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white active:bg-amber-600"
                    >
                      🪜 게임 시작
                    </button>
                  </div>
                  <button
                    onClick={handleGameReset}
                    className="mt-2 w-full rounded-xl bg-slate-600 py-2.5 text-sm font-semibold text-white active:bg-slate-700"
                  >
                    게임 초기화
                  </button>
                </div>
              ) : (
                // 진행(공개) 단계
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    참가자를 눌러 하나씩 공개 ({game.revealed.length}/{game.players.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {game.players.map((name, i) => {
                      const revealed = game.revealed.includes(i);
                      return (
                        <button
                          key={i}
                          disabled={revealed}
                          onClick={() => handleLadderReveal(i)}
                          className={`rounded-xl py-2.5 text-sm font-semibold ${
                            revealed
                              ? "bg-slate-100 text-slate-400"
                              : "bg-amber-500 text-white active:bg-amber-600"
                          }`}
                        >
                          {revealed
                            ? `${name} → ${game.prizes[game.mapping?.[i] ?? 0]}`
                            : `▶ ${name}`}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleGameReset}
                    className="mt-3 w-full rounded-xl bg-slate-600 py-2.5 text-sm font-semibold text-white active:bg-slate-700"
                  >
                    게임 초기화
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 룰렛 생성 폼 (탭=룰렛 & 진행 중 게임 없음) */}
      {!game && mode === "ROULETTE" && (
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-3 font-bold">🎡 새 룰렛 만들기</h2>
          <input
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
            placeholder="게임 제목 (예: 오늘의 당첨자 룰렛)"
            value={gameTitle}
            onChange={(e) => setGameTitle(e.target.value)}
          />
          <div className="space-y-2">
            {rouletteItems.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
                  placeholder={`항목 ${i + 1}`}
                  value={opt}
                  onChange={(e) => setAt(setRouletteItems, i, e.target.value)}
                />
                {rouletteItems.length > 2 && (
                  <button
                    onClick={() => removeAt(setRouletteItems, i)}
                    className="rounded-lg bg-slate-200 px-3 text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => addAt(setRouletteItems)}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500"
          >
            + 항목 추가
          </button>
          <button
            onClick={handleRouletteCreate}
            className="mt-4 w-full rounded-xl bg-amber-500 py-3 font-semibold text-white active:bg-amber-600"
          >
            룰렛 오픈
          </button>
        </div>
      )}

      {/* 사다리 생성 폼 (탭=사다리 & 진행 중 게임 없음) — 결과만 입력해 오픈 */}
      {!game && mode === "LADDER" && (
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-1 font-bold">🪜 새 사다리타기 만들기</h2>
          <p className="mb-3 text-xs text-slate-500">
            결과(도착 칸)만 먼저 입력하세요. 참가자는 오픈 후 입력합니다. 사다리 중간은 가림막으로 가려집니다. (결과 2개 이상)
          </p>
          <input
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
            placeholder="게임 제목 (예: 청소 당번 사다리)"
            value={gameTitle}
            onChange={(e) => setGameTitle(e.target.value)}
          />
          <p className="mb-1 text-xs font-semibold text-slate-500">결과</p>
          <div className="space-y-2">
            {ladderPrizes.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
                  placeholder={`결과 ${i + 1} (예: 당첨 / 꽝)`}
                  value={p}
                  onChange={(e) => setAt(setLadderPrizes, i, e.target.value)}
                />
                {ladderPrizes.length > 2 && (
                  <button
                    onClick={() => removeAt(setLadderPrizes, i)}
                    className="rounded-lg bg-slate-200 px-3 text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => addAt(setLadderPrizes)}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500"
          >
            + 결과 추가
          </button>
          <button
            onClick={handleLadderCreate}
            className="mt-4 w-full rounded-xl bg-amber-500 py-3 font-semibold text-white active:bg-amber-600"
          >
            사다리 오픈
          </button>
        </div>
      )}

      {/* 채팅 관리: 전체 채팅 기록 초기화 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="mb-2 text-xs font-medium text-amber-700">채팅 관리</p>
        <button
          onClick={handleClearChat}
          className="w-full rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-semibold text-amber-700 active:bg-amber-100"
        >
          💬 전체 채팅 기록 초기화
        </button>
        <p className="mt-2 text-xs text-amber-600/80">
          모든 사용자의 채팅창이 즉시 비워집니다. 투표 결과에는 영향을 주지 않아요.
        </p>
      </div>

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
