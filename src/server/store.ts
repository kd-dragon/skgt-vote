import type {
  ChatMessage,
  RoomStatus,
  StateSnapshot,
  User,
  Vote,
  VoteOption,
} from "@/lib/types";

/**
 * 서버 메모리 기반 단일 방(Room) 상태 저장소.
 * RDB 없이 프로세스 메모리에만 상태를 보관하므로, 서버 재시작 시 초기화됩니다.
 * (행사용 1회성 서비스 특성상 충분히 가볍게 동작합니다.)
 */
class EventStore {
  private users = new Map<string, User>();
  private messages: ChatMessage[] = [];
  private currentVote: Vote | null = null;
  private previousVote: Vote | null = null; // 직전에 종료된 투표 결과
  private voters = new Set<string>(); // 현재 투표에 참여한 clientId 집합 (1인 1표)

  private readonly MAX_MESSAGES = 200; // 메모리 보호용 채팅 보관 상한

  // ── 사용자 ──────────────────────────────
  addUser(id: string, clientId: string, nickname: string, color: string): User {
    const user: User = { id, clientId, nickname, color, joinedAt: Date.now() };
    this.users.set(id, user);
    return user;
  }

  removeUser(id: string): User | undefined {
    const user = this.users.get(id);
    this.users.delete(id);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  get userCount(): number {
    return this.users.size;
  }

  // ── 채팅 ──────────────────────────────
  addMessage(msg: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
    const message: ChatMessage = {
      ...msg,
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages = this.messages.slice(-this.MAX_MESSAGES);
    }
    return message;
  }

  // ── 투표 ──────────────────────────────
  createVote(title: string, optionLabels: string[]): Vote {
    const options: VoteOption[] = optionLabels.map((label, i) => ({
      id: `opt_${i}_${Math.random().toString(36).slice(2, 6)}`,
      label,
    }));
    const results: Record<string, number> = {};
    options.forEach((o) => (results[o.id] = 0));

    // 이전에 종료된 투표가 남아있으면 지난 결과로 보존
    if (this.currentVote && this.currentVote.status === "CLOSED") {
      this.previousVote = this.currentVote;
    }
    this.voters.clear(); // 새 투표 시작 시 투표자 명단 초기화

    this.currentVote = {
      id: `v_${Date.now()}`,
      title,
      options,
      status: "OPEN",
      results,
      createdAt: Date.now(),
    };
    return this.currentVote;
  }

  /** 해당 clientId 가 현재 투표에 이미 참여했는지 */
  hasVoted(clientId: string): boolean {
    return this.voters.has(clientId);
  }

  /**
   * 투표 1표 반영 (1인 1표).
   * @returns "ok" 성공 | "closed" 투표 없음/종료됨 | "invalid" 잘못된 선택 | "duplicate" 중복 투표
   */
  castVote(optionId: string, clientId: string): "ok" | "closed" | "invalid" | "duplicate" {
    const vote = this.currentVote;
    if (!vote || vote.status !== "OPEN") return "closed";
    if (!(optionId in vote.results)) return "invalid";
    if (this.voters.has(clientId)) return "duplicate";
    vote.results[optionId] += 1;
    this.voters.add(clientId);
    return "ok";
  }

  closeVote(): Vote | null {
    if (this.currentVote) this.currentVote.status = "CLOSED";
    return this.currentVote;
  }

  resetVote(): void {
    // 종료된 투표는 지난 결과로 보존한 뒤 현재 투표를 비움
    if (this.currentVote && this.currentVote.status === "CLOSED") {
      this.previousVote = this.currentVote;
    }
    this.currentVote = null;
    this.voters.clear();
  }

  /** 전체 초기화: 현재 투표 + 지난 결과 히스토리까지 모두 삭제 */
  hardReset(): void {
    this.currentVote = null;
    this.previousVote = null;
    this.voters.clear();
  }

  get vote(): Vote | null {
    return this.currentVote;
  }

  get prevVote(): Vote | null {
    return this.previousVote;
  }

  get roomStatus(): RoomStatus {
    if (!this.currentVote) return "WAITING";
    return this.currentVote.status === "OPEN" ? "VOTING" : "CLOSED";
  }

  // ── 스냅샷 ──────────────────────────────
  snapshot(): StateSnapshot {
    return {
      roomStatus: this.roomStatus,
      userCount: this.userCount,
      messages: this.messages,
      currentVote: this.currentVote,
      previousVote: this.previousVote,
    };
  }
}

// 프로세스 전역 싱글턴 (dev 모드 HMR 대비 globalThis 캐싱)
const globalForStore = globalThis as unknown as { __eventStore?: EventStore };
export const store = globalForStore.__eventStore ?? new EventStore();
if (!globalForStore.__eventStore) globalForStore.__eventStore = store;
