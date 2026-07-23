// 실시간 이모지 폭탄에 사용하는 이모지 목록 (클라이언트/서버 공용)
export const EMOJIS = ["❤️", "🔥", "🎉", "👏"] as const;

/** 허용된 이모지 타입인지 검증 (서버 브로드캐스트 화이트리스트) */
export function isValidEmoji(type: string): boolean {
  return (EMOJIS as readonly string[]).includes(type);
}
