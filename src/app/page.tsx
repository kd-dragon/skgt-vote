"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { getClientId, getSavedColor, saveColor } from "@/lib/clientId";
import { CREWMATE_COLORS, DEFAULT_COLOR_ID, getCrewmateColor } from "@/lib/crewmates";
import type { ChatMessage, Vote } from "@/lib/types";
import VoteResult from "@/components/VoteResult";
import ResultReveal from "@/components/ResultReveal";
import Crewmate from "@/components/Crewmate";

export default function UserPage() {
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR_ID);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [vote, setVote] = useState<Vote | null>(null);
  const [prevVote, setPrevVote] = useState<Vote | null>(null);
  const [voted, setVoted] = useState(false);
  const [input, setInput] = useState("");
  const [revealVote, setRevealVote] = useState<Vote | null>(null); // 발표 오버레이 대상

  const chatEndRef = useRef<HTMLDivElement>(null);
  const voteRef = useRef<Vote | null>(null); // OPEN→CLOSED 전환 감지용

  // 저장된 크루원 색상 복원
  useEffect(() => {
    const saved = getSavedColor();
    if (saved) setColor(saved);
  }, []);

  // 소켓 이벤트 구독
  useEffect(() => {
    const socket = getSocket();

    socket.on("state:sync", (snap) => {
      setMessages(snap.messages);
      setUserCount(snap.userCount);
      voteRef.current = snap.currentVote;
      setVote(snap.currentVote);
      setPrevVote(snap.previousVote);
    });
    socket.on("chat:new", (msg) => setMessages((prev) => [...prev, msg]));
    socket.on("users:update", (count) => setUserCount(count));
    socket.on("vote:update", (v) => {
      const prev = voteRef.current;
      voteRef.current = v;
      // 투표 ID가 바뀔 때(=새 투표)만 투표 가능 상태로 초기화.
      if (v?.id !== prev?.id) setVoted(false);
      // OPEN → CLOSED 전환 순간에 결과 발표 오버레이 실행
      if (v && v.status === "CLOSED" && prev?.id === v.id && prev.status === "OPEN") {
        setRevealVote(v);
      }
      setVote(v);
    });
    // 지난 투표 결과 갱신
    socket.on("vote:previous", (v) => setPrevVote(v));
    // 서버 권위 값: 현재 투표에 이미 참여했는지 (재접속/새로고침 복원)
    socket.on("vote:voted", (v) => setVoted(v));
    socket.on("error:msg", (m) => alert(m));

    return () => {
      socket.off("state:sync");
      socket.off("chat:new");
      socket.off("users:update");
      socket.off("vote:update");
      socket.off("vote:previous");
      socket.off("vote:voted");
      socket.off("error:msg");
    };
  }, []);

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = () => {
    const name = nickname.trim();
    if (!name) return;
    getSocket().emit(
      "user:join",
      { nickname: name, clientId: getClientId(), color },
      (ok) => {
        if (ok) {
          saveColor(color);
          setJoined(true);
        }
      }
    );
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    getSocket().emit("chat:send", { message: text });
    setInput("");
  };

  const handleVote = (optionId: string) => {
    // 투표 확정 여부는 서버의 vote:voted 이벤트로 처리(중복/종료 시 오작동 방지)
    getSocket().emit("vote:cast", { optionId });
  };

  // ── 닉네임/캐릭터 선택 화면 ──────────────────────────────
  if (!joined) {
    return (
      <main className="space-bg flex min-h-[100dvh] flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          {/* 선택한 크루원 미리보기 */}
          <div className="mb-2 flex justify-center">
            <Crewmate color={color} size={92} className="float-y drop-shadow-lg" />
          </div>
          <h1 className="mb-1 text-center text-2xl font-extrabold tracking-tight">
            SKGT 우주선 🚀
          </h1>
          <p className="mb-5 text-center text-sm text-white/60">
            크루원을 고르고 탑승하세요
          </p>

          <input
            className="mb-4 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder-white/40 outline-none focus:border-cyan-300"
            placeholder="닉네임 (최대 20자)"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />

          {/* 캐릭터(색상) 선택 그리드 */}
          <p className="mb-2 text-xs font-semibold text-white/50">캐릭터 색상</p>
          <div className="mb-5 grid grid-cols-6 gap-2">
            {CREWMATE_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setColor(c.id)}
                aria-label={c.name}
                aria-pressed={color === c.id}
                className={`flex items-center justify-center rounded-xl p-1 transition ${
                  color === c.id
                    ? "bg-white/20 ring-2 ring-cyan-300"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                <Crewmate color={c.id} size={34} />
              </button>
            ))}
          </div>

          <button
            onClick={handleJoin}
            className="au-btn w-full bg-cyan-400 py-3 text-base text-slate-900 border-cyan-600 hover:brightness-105"
          >
            탑승하기
          </button>
        </div>
      </main>
    );
  }

  // ── 채팅 + 투표 화면 ──────────────────────────────
  return (
    <main className="space-bg flex h-[100dvh] flex-col text-white">
      {/* 결과 발표 오버레이 (투표 종료 순간 자동 등장) */}
      {revealVote && (
        <ResultReveal vote={revealVote} onClose={() => setRevealVote(null)} />
      )}

      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Crewmate color={color} size={28} />
          <span className="font-bold">SKGT 우주선</span>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm">
          🧑‍🚀 {userCount}명 탑승
        </span>
      </header>

      {/* 진행 중 투표 배너 */}
      {vote && (
        <section className="border-b border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{vote.title}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                vote.status === "OPEN"
                  ? "bg-emerald-400/20 text-emerald-300"
                  : "bg-white/10 text-white/60"
              }`}
            >
              {vote.status === "OPEN" ? "진행 중" : "종료됨"}
            </span>
          </div>

          {vote.status === "OPEN" && !voted ? (
            // 진행 중 & 미투표: 후보 버튼만 노출 (집계 비공개)
            <div className="grid grid-cols-1 gap-2">
              {vote.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleVote(opt.id)}
                  className="au-btn bg-indigo-500 py-3 text-white border-indigo-800 hover:brightness-110"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : vote.status === "OPEN" && voted ? (
            // 진행 중 & 투표 완료: 결과는 숨기고 완료 안내만 (집계 비공개)
            <div className="rounded-xl bg-black/20 py-6 text-center">
              <p className="text-sm font-semibold text-emerald-300">✅ 투표 완료!</p>
              <p className="mt-1 text-xs text-white/50">
                결과는 투표 종료 후 공개됩니다.
              </p>
            </div>
          ) : (
            // 종료됨: 최종 결과 공개
            <VoteResult vote={vote} dark />
          )}
        </section>
      )}

      {/* 지난 투표 결과 (사용자 조회용, 간단히 펼쳐보기) */}
      {prevVote && (
        <section className="border-b border-white/10 bg-black/20 px-4 py-3">
          <details>
            <summary className="cursor-pointer select-none text-sm font-semibold text-white/70">
              📊 지난 투표 결과 · {prevVote.title}
            </summary>
            <div className="mt-3">
              <VoteResult vote={prevVote} dark />
            </div>
          </details>
        </section>
      )}

      {/* 채팅 영역 */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id}>
            {m.system ? (
              <p className="flex items-center justify-center gap-1 text-center text-xs text-white/40">
                {m.color && <Crewmate color={m.color} size={16} />}
                {m.message}
              </p>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2">
                <Crewmate color={m.color} size={22} className="mt-0.5 shrink-0" />
                <div className="min-w-0 text-sm">
                  <span
                    className="mr-1 font-bold"
                    style={{ color: brightName(m.color) }}
                  >
                    {m.nickname}
                  </span>
                  <span className="break-words text-white/90">{m.message}</span>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* 입력창 */}
      <div className="flex gap-2 border-t border-white/10 bg-black/30 p-3 backdrop-blur">
        <input
          className="flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-base text-white placeholder-white/40 outline-none focus:border-cyan-300"
          placeholder="메시지 입력..."
          value={input}
          maxLength={300}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          onClick={handleSend}
          className="au-btn bg-cyan-400 px-5 text-slate-900 border-cyan-600 hover:brightness-105"
        >
          전송
        </button>
      </div>
    </main>
  );
}

/** 어두운 배경에서 잘 보이도록 닉네임 색을 밝게 보정 */
function brightName(colorId?: string): string {
  const c = getCrewmateColor(colorId);
  // 어두운 계열(검정/갈색/보라/파랑)은 흰색에 가깝게, 나머지는 본색 사용
  const darkish = ["black", "brown", "purple", "blue", "green", "red"];
  return darkish.includes(c.id) ? "#E5EDFB" : c.hex;
}
