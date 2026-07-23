import type {
  ChatMessage,
  Game,
  LadderRung,
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
  private currentGame: Game | null = null; // 진행 중인 미니게임(룰렛/사다리)

  private readonly MAX_MESSAGES = 200; // 도배 버스트 대비 개수 하드 상한
  // 오래된 채팅 보관 시간(TTL). 이 시간이 지난 메시지는 자동 정리한다.
  private readonly MESSAGE_TTL_MS =
    (Number(process.env.CHAT_TTL_MIN) || 60) * 60 * 1000; // 기본 60분

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
    this.pruneMessages();
    return message;
  }

  /**
   * 오래된 채팅 정리.
   * 1) TTL 초과 메시지 제거(시간순이므로 앞에서부터) → 메모리 회수
   * 2) 개수 상한 초과분 제거(도배 버스트 대비 하드 실링)
   */
  private pruneMessages(): void {
    const cutoff = Date.now() - this.MESSAGE_TTL_MS;
    let expired = 0;
    while (
      expired < this.messages.length &&
      this.messages[expired].timestamp < cutoff
    ) {
      expired += 1;
    }
    if (expired > 0) this.messages = this.messages.slice(expired);
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages = this.messages.slice(-this.MAX_MESSAGES);
    }
  }

  /** 전체 채팅 기록 삭제 (관리자용) */
  clearMessages(): void {
    this.messages = [];
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

  /** 전체 초기화: 현재 투표 + 지난 결과 히스토리 + 진행 중 게임까지 모두 삭제 */
  hardReset(): void {
    this.currentVote = null;
    this.previousVote = null;
    this.voters.clear();
    this.currentGame = null;
  }

  // ── 미니게임(룰렛 / 사다리) ──────────────────────────────
  /**
   * 게임 생성 & 오픈.
   * - 룰렛: `items`(원판 항목, ≥2)로 생성. `prizes` 미사용.
   * - 사다리: `prizes`(결과, ≥2)로 생성. 참가자(`players`)는 빈 칸으로 시작하고
   *   이후 `setLadderPlayers` 로 채운다. `items` 미사용.
   * @returns 생성된 게임 (검증 실패 시 null)
   */
  createGame(
    type: "ROULETTE" | "LADDER",
    title: string,
    items: string[],
    prizes?: string[]
  ): Game | null {
    const t = (title || "").trim();
    if (!t) return null;

    if (type === "ROULETTE") {
      const cleanItems = (items || []).map((s) => s.trim()).filter(Boolean);
      if (cleanItems.length < 2) return null;
      this.currentGame = {
        id: `g_${Date.now()}`,
        type: "ROULETTE",
        title: t,
        options: cleanItems,
        status: "OPEN",
        winnerIndex: null,
        createdAt: Date.now(),
      };
      return this.currentGame;
    }

    // 사다리: 결과만 입력받아 오픈. 참가자는 이후 입력.
    const cleanPrizes = (prizes || []).map((s) => s.trim()).filter(Boolean);
    if (cleanPrizes.length < 2) return null;

    const cols = cleanPrizes.length;
    const rows = Math.max(16, cols * 4); // 세로 칸 수(가로대가 더 촘촘하도록 2배로)
    this.currentGame = {
      id: `g_${Date.now()}`,
      type: "LADDER",
      title: t,
      players: Array<string>(cols).fill(""), // 참가자는 빈 칸으로 시작
      prizes: cleanPrizes,
      rows,
      rungs: this.buildLadderRungs(cols, rows),
      status: "OPEN",
      mapping: null,
      revealed: [],
      createdAt: Date.now(),
    };
    return this.currentGame;
  }

  /** 사다리: 참가자 이름 설정 (OPEN 단계). 결과 개수와 길이가 같아야 함. */
  setLadderPlayers(players: string[]): Game | null {
    const g = this.currentGame;
    if (!g || g.type !== "LADDER" || g.status !== "OPEN") return null;
    if (!Array.isArray(players) || players.length !== g.prizes.length) return null;
    g.players = players.map((s) => (s || "").trim().slice(0, 20));
    return g;
  }

  /** 사다리: 게임 시작 → 매핑 확정, PLAYING 전환. 참가자 전원 입력 필요. */
  startLadder(): Game | null {
    const g = this.currentGame;
    if (!g || g.type !== "LADDER" || g.status !== "OPEN") return null;
    if (g.players.some((p) => !p.trim())) return null; // 빈 참가자 있으면 시작 불가
    g.mapping = this.resolveLadder(g.players.length, g.rows, g.rungs);
    g.revealed = [];
    g.status = "PLAYING";
    return g;
  }

  /** 사다리: 참가자 한 명 공개 (토큰 하강). */
  revealLadder(index: number): Game | null {
    const g = this.currentGame;
    if (!g || g.type !== "LADDER" || g.status !== "PLAYING") return null;
    if (index < 0 || index >= g.players.length) return null;
    if (!g.revealed.includes(index)) g.revealed.push(index);
    return g;
  }

  /**
   * 사다리 가로줄 랜덤 생성.
   * 같은 행에서 인접한 다리가 겹치지 않도록(한 열은 좌우 중 최대 한 방향만) 배치.
   */
  private buildLadderRungs(cols: number, rows: number): LadderRung[] {
    const rungs: LadderRung[] = [];
    for (let row = 0; row < rows; row++) {
      let col = 0;
      while (col < cols - 1) {
        // 약 45% 확률로 다리 생성, 생성 시 다음 열은 건너뜀(겹침 방지)
        if (Math.random() < 0.45) {
          rungs.push({ row, col });
          col += 2;
        } else {
          col += 1;
        }
      }
    }
    return rungs;
  }

  /**
   * 룰렛 실행: 서버가 당첨을 확정하고 status 를 RESULT 로 전환.
   * (사다리는 startLadder/revealLadder 로 진행)
   * @returns 결과가 반영된 게임 (룰렛 아님/이미 실행됨이면 null)
   */
  runGame(): Game | null {
    const game = this.currentGame;
    if (!game || game.type !== "ROULETTE" || game.status !== "OPEN") return null;
    game.winnerIndex = Math.floor(Math.random() * game.options.length);
    game.status = "RESULT";
    return game;
  }

  /** 사다리 경로 계산: 각 시작 열(참가자)이 도착하는 끝 열(결과) 인덱스 배열 반환 */
  private resolveLadder(cols: number, rows: number, rungs: LadderRung[]): number[] {
    // row -> 그 행에 존재하는 다리의 왼쪽 열 집합
    const byRow: Set<number>[] = Array.from({ length: rows }, () => new Set<number>());
    rungs.forEach((r) => byRow[r.row]?.add(r.col));

    const mapping: number[] = [];
    for (let start = 0; start < cols; start++) {
      let pos = start;
      for (let row = 0; row < rows; row++) {
        if (byRow[row].has(pos)) {
          pos += 1; // 오른쪽 다리로 이동
        } else if (byRow[row].has(pos - 1)) {
          pos -= 1; // 왼쪽 다리로 이동
        }
      }
      mapping[start] = pos;
    }
    return mapping;
  }

  /** 게임 초기화 (현재 게임 제거) */
  resetGame(): void {
    this.currentGame = null;
  }

  get game(): Game | null {
    return this.currentGame;
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
    this.pruneMessages(); // 신규 접속자에게 만료된 채팅이 나가지 않도록 정리
    return {
      roomStatus: this.roomStatus,
      userCount: this.userCount,
      messages: this.messages,
      currentVote: this.currentVote,
      previousVote: this.previousVote,
      currentGame: this.currentGame,
    };
  }
}

// 프로세스 전역 싱글턴 (dev 모드 HMR 대비 globalThis 캐싱)
const globalForStore = globalThis as unknown as { __eventStore?: EventStore };
export const store = globalForStore.__eventStore ?? new EventStore();
if (!globalForStore.__eventStore) globalForStore.__eventStore = store;
