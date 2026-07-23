"use client";

import { useEffect } from "react";
import Crewmate from "@/components/Crewmate";

const AUTO_CLOSE_MS = 2900; // 연출 후 자동 종료 (투표 화면으로 복귀)

/**
 * 새 투표가 생성됐을 때 사용자 화면에 등장하는 어몽어스풍 "긴급 투표" 오버레이.
 * 빨간 경고 플래시 + 화면 흔들림 + 크루원 난입 + 큰 텍스트 팝 연출 후 자동으로 닫힌다.
 * (탭하면 즉시 넘길 수 있음)
 */
export default function EmergencyMeeting({
  title,
  color,
  onClose,
}: {
  title: string;
  color?: string; // 난입하는 크루원 색상 (보통 접속자 본인 색)
  onClose: () => void;
}) {
  // 일정 시간 후 자동 종료
  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="button"
      aria-label="긴급 투표 알림 닫기"
      className="reveal-fade fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90"
    >
      {/* 빨간 경고 플래시 (점멸) */}
      <div
        className="em-flash pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(220,38,38,0.55) 0%, rgba(120,10,10,0.35) 45%, rgba(0,0,0,0) 75%)",
        }}
        aria-hidden
      />

      {/* 배경 방사형 속도선 (회전) */}
      <div
        className="em-spin pointer-events-none absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] -translate-x-1/2 -translate-y-1/2 opacity-20"
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.9) 0deg 2deg, transparent 2deg 10deg)",
        }}
        aria-hidden
      />

      {/* 흔들리는 콘텐츠 */}
      <div className="em-shake relative z-10 flex flex-col items-center px-6 text-center">
        <div className="em-crew-in mb-2">
          <Crewmate color={color} size={132} className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
        </div>

        <div className="em-text-in">
          <p className="text-4xl font-black leading-tight tracking-tight text-red-500 drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] sm:text-5xl">
            🚨 긴급 투표! 🚨
          </p>
          <p className="mt-1 text-sm font-bold uppercase tracking-[0.3em] text-white/60">
            Emergency Meeting
          </p>

          <div className="mx-auto mt-5 max-w-xs rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur">
            <p className="text-lg font-extrabold text-white">{title}</p>
          </div>

          <p className="mt-6 text-xs text-white/40">화면을 탭하면 바로 참여할 수 있어요</p>
        </div>
      </div>
    </div>
  );
}
