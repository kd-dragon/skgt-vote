"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { getClientId } from "@/lib/clientId";
import type { ChatMessage, Vote } from "@/lib/types";
import VoteResult from "@/components/VoteResult";
import ResultReveal from "@/components/ResultReveal";

export default function UserPage() {
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [vote, setVote] = useState<Vote | null>(null);
  const [prevVote, setPrevVote] = useState<Vote | null>(null);
  const [voted, setVoted] = useState(false);
  const [input, setInput] = useState("");
  const [revealVote, setRevealVote] = useState<Vote | null>(null); // 발표 오버레이 대상

  const chatEndRef = useRef<HTMLDivElement>(null);
  const voteRef = useRef<Vote | null>(null); // OPEN→CLOSED 전환 감지용

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
      { nickname: name, clientId: getClientId() },
      (ok) => {
        if (ok) setJoined(true);
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

  // ── 닉네임 입력 화면 ──────────────────────────────
  if (!joined) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
          <h1 className="mb-1 text-center text-2xl font-bold text-brand">
            실시간 투표 & 채팅
          </h1>
          <p className="mb-6 text-center text-sm text-slate-500">
            닉네임을 입력하고 입장하세요
          </p>
          <input
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-brand"
            placeholder="닉네임 (최대 20자)"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <button
            onClick={handleJoin}
            className="w-full rounded-xl bg-brand py-3 text-base font-semibold text-white active:bg-brand-dark"
          >
            입장하기
          </button>
        </div>
      </main>
    );
  }

  // ── 채팅 + 투표 화면 ──────────────────────────────
  return (
    <main className="flex h-[100dvh] flex-col">
      {/* 결과 발표 오버레이 (투표 종료 순간 자동 등장) */}
      {revealVote && (
        <ResultReveal vote={revealVote} onClose={() => setRevealVote(null)} />
      )}

      {/* 헤더 */}
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white shadow">
        <span className="font-semibold">실시간 채팅</span>
        <span className="text-sm opacity-90">👥 {userCount}명 접속</span>
      </header>

      {/* 진행 중 투표 배너 */}
      {vote && (
        <section className="border-b bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
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

          {vote.status === "OPEN" && !voted ? (
            // 진행 중 & 미투표: 후보 버튼만 노출 (집계 비공개)
            <div className="grid grid-cols-1 gap-2">
              {vote.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleVote(opt.id)}
                  className="rounded-xl border-2 border-brand py-3 font-medium text-brand active:bg-brand active:text-white"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : vote.status === "OPEN" && voted ? (
            // 진행 중 & 투표 완료: 결과는 숨기고 완료 안내만 (집계 비공개)
            <div className="rounded-xl bg-slate-50 py-6 text-center">
              <p className="text-sm font-medium text-green-600">
                ✅ 투표 완료!
              </p>
              <p className="mt-1 text-xs text-slate-400">
                결과는 투표 종료 후 공개됩니다.
              </p>
            </div>
          ) : (
            // 종료됨: 최종 결과 공개
            <VoteResult vote={vote} />
          )}
        </section>
      )}

      {/* 지난 투표 결과 (사용자 조회용, 간단히 펼쳐보기) */}
      {prevVote && (
        <section className="border-b bg-slate-50 px-4 py-3">
          <details>
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-600">
              📊 지난 투표 결과 · {prevVote.title}
            </summary>
            <div className="mt-3">
              <VoteResult vote={prevVote} />
            </div>
          </details>
        </section>
      )}

      {/* 채팅 영역 */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id}>
            {m.system ? (
              <p className="text-center text-xs text-slate-400">{m.message}</p>
            ) : (
              <div className="text-sm">
                <span className="font-semibold text-brand">{m.nickname}</span>{" "}
                <span className="break-words">{m.message}</span>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* 입력창 */}
      <div className="flex gap-2 border-t bg-white p-3">
        <input
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-base outline-none focus:border-brand"
          placeholder="메시지 입력..."
          value={input}
          maxLength={300}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          onClick={handleSend}
          className="rounded-full bg-brand px-5 font-semibold text-white active:bg-brand-dark"
        >
          전송
        </button>
      </div>
    </main>
  );
}
