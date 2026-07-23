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
  currentGame: Game | null; // 진행 중인 미니게임(룰렛/사다리), 없으면 null
}

// ── 미니게임(룰렛 / 사다리타기) ──────────────────────────────

/**
 * 게임 상태.
 * - OPEN: 관리자가 항목 입력 후 오픈, 사용자는 대기(관전)
 *   (사다리: 결과 입력 후 오픈 → 참가자 입력 대기 단계)
 * - PLAYING: (사다리 전용) 게임 시작 후 관리자가 참가자를 하나씩 공개하는 단계
 * - RESULT: (룰렛 전용) 관리자가 실행 → 서버가 결과 확정 → 전원 화면에 연출
 */
export type GameStatus = "OPEN" | "PLAYING" | "RESULT";

/** 룰렛 게임 */
export interface RouletteGame {
  id: string;
  type: "ROULETTE";
  title: string;
  options: string[]; // 원판 항목 (≥2)
  status: GameStatus;
  winnerIndex: number | null; // 서버가 정한 당첨 항목 인덱스 (RESULT일 때만)
  createdAt: number;
}

/** 사다리타기 가로줄: row 행에서 col 열과 col+1 열을 잇는 다리 */
export interface LadderRung {
  row: number;
  col: number;
}

/**
 * 사다리타기 게임 (관리자 실행·전원 관전, 단계 진행형).
 * 흐름: 결과 입력 후 오픈(OPEN, 하단 결과는 사용자에게 ❓로 가림)
 *   → 관리자가 참가자 이름 입력(players)
 *   → 게임 시작(PLAYING, mapping 확정)
 *   → 관리자가 참가자를 하나씩 공개(revealed 누적)하면 해당 토큰이 하강
 */
export interface LadderGame {
  id: string;
  type: "LADDER";
  title: string;
  players: string[]; // 위쪽 참가자 (초기엔 빈 문자열, 관리자가 채움) length == prizes.length
  prizes: string[]; // 아래쪽 결과 (≥2)
  rows: number; // 사다리 세로 칸 수
  rungs: LadderRung[]; // 가로줄 목록 (서버가 랜덤 생성)
  status: GameStatus; // OPEN → PLAYING
  mapping: number[] | null; // playerIndex -> prizeIndex (PLAYING 시작 시 확정)
  revealed: number[]; // 공개된 참가자 인덱스 (공개 순서대로 누적)
  createdAt: number;
}

export type Game = RouletteGame | LadderGame;

// ── Socket.io 이벤트 타입 정의 ──────────────────────────────

/** 서버 -> 클라이언트 */
export interface ServerToClientEvents {
  "state:sync": (snapshot: StateSnapshot) => void;
  "chat:new": (message: ChatMessage) => void;
  /** 채팅 기록 전체 초기화 (관리자가 실행) → 사용자 화면 채팅창 비움 */
  "chat:clear": () => void;
  "users:update": (count: number) => void;
  "vote:update": (vote: Vote | null) => void;
  /** 직전 종료된 투표 결과 (사용자 조회용) */
  "vote:previous": (vote: Vote | null) => void;
  /** 현재 투표에 대해 "당신이 이미 투표했는지" 개인 알림 (서버 권위 값) */
  "vote:voted": (voted: boolean) => void;
  /** 미니게임 상태 갱신 (생성/실행/초기화). null 이면 게임 없음 */
  "game:update": (game: Game | null) => void;
  /** 이모지 폭탄: 방 전체에 이모지 count 개를 띄움 (서버가 200ms throttle 후 브로드캐스트) */
  "emoji:burst": (payload: { type: string; count: number }) => void;
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
  /** 이모지 폭탄 전송 (연타 시 서버가 200ms 단위로 throttle) */
  "emoji:send": (payload: { type: string; count?: number }) => void;
  // 관리자 전용
  /** 관리자 인증 후 실시간 집계 수신용 room 참여 */
  "admin:hello": (payload: { adminKey?: string }) => void;
  "admin:vote:create": (payload: { title: string; options: string[]; adminKey?: string }) => void;
  "admin:vote:close": (payload: { adminKey?: string }) => void;
  "admin:vote:reset": (payload: { adminKey?: string }) => void;
  /** 전체 초기화: 현재 투표 + 지난 결과 히스토리까지 모두 삭제 */
  "admin:reset:all": (payload: { adminKey?: string }) => void;
  /** 채팅 기록 전체 초기화 */
  "admin:chat:clear": (payload: { adminKey?: string }) => void;
  // 미니게임 (관리자 전용)
  /** 게임 생성 & 오픈. 룰렛=items(원판 항목) / 사다리=items(참가자)+prizes(결과) */
  "admin:game:create": (payload: {
    type: "ROULETTE" | "LADDER";
    title: string;
    items: string[];
    prizes?: string[];
    adminKey?: string;
  }) => void;
  /** 게임 실행 (룰렛: 서버가 당첨 확정 후 전원 브로드캐스트) */
  "admin:game:run": (payload: { adminKey?: string }) => void;
  /** 게임 초기화 (현재 게임 제거) */
  "admin:game:reset": (payload: { adminKey?: string }) => void;
  /** 사다리: 참가자 이름 설정 (OPEN 단계, 결과 개수와 동일) */
  "admin:game:ladder:players": (payload: { players: string[]; adminKey?: string }) => void;
  /** 사다리: 게임 시작 (매핑 확정, PLAYING 전환) */
  "admin:game:ladder:start": (payload: { adminKey?: string }) => void;
  /** 사다리: 참가자 한 명 공개 (해당 토큰 하강) */
  "admin:game:ladder:reveal": (payload: { index: number; adminKey?: string }) => void;
}
