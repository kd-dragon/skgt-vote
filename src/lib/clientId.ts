"use client";

const KEY = "skgt-vote-client-id";

/**
 * 브라우저별 영구 식별자. localStorage 에 저장하여 새로고침/재접속에도 유지.
 * 1인 1표 판별 기준으로 사용된다.
 * (브라우저/시크릿창을 바꾸면 다른 사용자로 인식되는 가벼운 수준의 제한)
 */
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
