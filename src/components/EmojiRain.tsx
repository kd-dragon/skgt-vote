"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { EMOJIS } from "@/lib/emojis";

const MAX_PARTICLES = 100; // 동시 파티클 상한 (성능 보호)
const MAX_PER_SPAWN = 30; // 한 이벤트로 만들 최대 파티클 수

const MEGA_CHANCE = 0.05; // 20번 중 1번 초대형 이모지

type Particle = {
  id: number;
  emoji: string;
  left: number; // 시작 x (%)
  size: number; // px
  duration: number; // ms
  drift: number; // 좌우 이동 px
  mega: boolean; // 초대형 여부
};

/**
 * 실시간 이모지 폭탄 (Emoji Rain).
 * - 하단 floating 버튼(❤️🔥🎉👏) 탭 → 아래에서 위로 둥둥 떠오르며 사라짐(CSS keyframes)
 * - 누른 본인은 즉시 스폰(Optimistic), 나머지에겐 서버가 200ms throttle 후 브로드캐스트
 */
export default function EmojiRain() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // count 개 파티클 스폰 (상한 초과분은 버림)
  const spawn = (emoji: string, count: number) => {
    const want = Math.min(Math.max(1, count), MAX_PER_SPAWN);
    setParticles((prev) => {
      const room = Math.max(0, MAX_PARTICLES - prev.length);
      const make = Math.min(want, room);
      const added: Particle[] = [];
      for (let i = 0; i < make; i++) {
        const id = ++idRef.current;
        const mega = Math.random() < MEGA_CHANCE; // 1% 확률로 초대형
        const duration = mega ? 3800 + Math.random() * 1200 : 2400 + Math.random() * 1600;
        added.push({
          id,
          emoji,
          // 초대형은 화면 중앙 부근에서 크게 떠오르도록
          left: mega ? 30 + Math.random() * 40 : 4 + Math.random() * 92,
          size: mega ? 160 + Math.random() * 60 : 26 + Math.random() * 20,
          duration,
          drift: mega ? (Math.random() - 0.5) * 40 : (Math.random() - 0.5) * 120,
          mega,
        });
        const t = setTimeout(() => {
          setParticles((cur) => cur.filter((x) => x.id !== id));
          timersRef.current.delete(t);
        }, duration + 120);
        timersRef.current.add(t);
      }
      return added.length ? [...prev, ...added] : prev;
    });
  };

  // 다른 사용자의 이모지 수신
  useEffect(() => {
    const socket = getSocket();
    const onBurst = ({ type, count }: { type: string; count: number }) =>
      spawn(type, count);
    socket.on("emoji:burst", onBurst);
    return () => {
      socket.off("emoji:burst", onBurst);
    };
  }, []);

  // 언마운트 시 잔여 타이머 정리
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const handleTap = (emoji: string) => {
    spawn(emoji, 1); // Optimistic: 본인 화면 즉시 반응
    getSocket().emit("emoji:send", { type: emoji }); // 서버가 200ms throttle 후 전파
  };

  return (
    <>
      {/* 파티클 오버레이 (클릭 통과) */}
      <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
        {particles.map((p) => (
          <span
            key={p.id}
            className="emoji-rise absolute bottom-2"
            style={
              {
                left: `${p.left}%`,
                fontSize: `${p.size}px`,
                animationDuration: `${p.duration}ms`,
                "--drift": `${p.drift}px`,
                filter: p.mega
                  ? "drop-shadow(0 0 18px rgba(255,215,0,0.9))"
                  : undefined,
                zIndex: p.mega ? 1 : undefined,
              } as React.CSSProperties
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>

      {/* floating 이모지 버튼 (채팅 입력창 위) */}
      <div className="fixed bottom-24 right-3 z-40 flex flex-col gap-2">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => handleTap(e)}
            aria-label={`${e} 반응 보내기`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-2xl shadow-lg backdrop-blur transition active:scale-90 hover:bg-black/60"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
