// 핵심 도메인 데이터 구조 (In-Memory)

/** 방/이벤트 상태 */
export type RoomStatus = "WAITING" | "VOTING" | "CLOSED";

/** 접속 사용자 */
export interface User {
  id: string; // socket id 기반 (재연결 시 변경됨)
  clientId: string; // 브라우저 localStorage 영구 식별자 (1인 1표 기준)
  nickname: string;
  color: string; // 크루원 색상 id (어몽어스 캐릭터)
  joinedAt: number;
}

/** 투표 후보(조/인원) */
export interface VoteOption {
  id: string;
  label: string;
}

export type VoteStatus = "OPEN" | "CLOSED";

/** 투표 */
export interface Vote {
  id: string;
  title: string;
  options: VoteOption[];
  status: VoteStatus;
  results: Record<string, number>; // optionId -> count
  createdAt: number;
}

/** 채팅 메시지 */
export interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  timestamp: number;
  color?: string; // 보낸 사람 크루원 색상 id (시스템 메시지는 없음)
  system?: boolean; // 입장/퇴장 등 시스템 알림 여부
}

/** 클라이언트로 내려주는 전체 상태 스냅샷 */
export interface StateSnapshot {
  roomStatus: RoomStatus;
  userCount: number;
  messages: ChatMessage[];
  currentVote: Vote | null; // 진행 중(OPEN)에는 사용자용은 집계가 0으로 마스킹됨
  previousVote: Vote | null; // 직전에 종료된 투표 결과(사용자 조회용)
}

// ── Socket.io 이벤트 타입 정의 ──────────────────────────────

/** 서버 -> 클라이언트 */
export interface ServerToClientEvents {
  "state:sync": (snapshot: StateSnapshot) => void;
  "chat:new": (message: ChatMessage) => void;
  "users:update": (count: number) => void;
  "vote:update": (vote: Vote | null) => void;
  /** 직전 종료된 투표 결과 (사용자 조회용) */
  "vote:previous": (vote: Vote | null) => void;
  /** 현재 투표에 대해 "당신이 이미 투표했는지" 개인 알림 (서버 권위 값) */
  "vote:voted": (voted: boolean) => void;
  "error:msg": (message: string) => void;
}

/** 클라이언트 -> 서버 */
export interface ClientToServerEvents {
  "user:join": (
    payload: { nickname: string; clientId: string; color: string },
    ack?: (ok: boolean) => void
  ) => void;
  "chat:send": (payload: { message: string }) => void;
  "vote:cast": (payload: { optionId: string }) => void;
  // 관리자 전용
  /** 관리자 인증 후 실시간 집계 수신용 room 참여 */
  "admin:hello": (payload: { adminKey?: string }) => void;
  "admin:vote:create": (payload: { title: string; options: string[]; adminKey?: string }) => void;
  "admin:vote:close": (payload: { adminKey?: string }) => void;
  "admin:vote:reset": (payload: { adminKey?: string }) => void;
  /** 전체 초기화: 현재 투표 + 지난 결과 히스토리까지 모두 삭제 */
  "admin:reset:all": (payload: { adminKey?: string }) => void;
}
