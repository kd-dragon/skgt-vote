import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Vote,
} from "@/lib/types";
import { DEFAULT_COLOR_ID, isValidColorId } from "@/lib/crewmates";
import { isValidEmoji } from "@/lib/emojis";
import { store } from "./store";

const EMOJI_THROTTLE_MS = 200; // 이모지 폭탄 throttle 창(연타 집계 단위)
const EMOJI_MAX_PER_FLUSH = 40; // 한 번에 브로드캐스트할 최대 개수(성능 보호)

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// 비밀 URL slug 이 곧 관리자 인증 토큰. 미설정 시 개발용 기본값 "dev".
const ADMIN_SLUG = process.env.ADMIN_SLUG || "dev";

// 관리자 전용 socket.io room (실시간 집계 수신)
const ADMIN_ROOM = "admins";

/** 관리자 토큰(=비밀 slug) 검증 */
function isAdmin(key?: string): boolean {
  return key === ADMIN_SLUG;
}

/** 진행 중 집계를 숨기기 위해 결과를 0으로 마스킹한 사본 반환 */
function maskVote(vote: Vote): Vote {
  const masked: Record<string, number> = {};
  vote.options.forEach((o) => (masked[o.id] = 0));
  return { ...vote, results: masked };
}

/**
 * 투표 상태 브로드캐스트.
 * - OPEN(진행 중): 관리자에게는 실시간 집계, 일반 사용자에게는 마스킹된 집계 전송
 * - CLOSED(종료)/null: 전체에게 실제 결과 공개
 */
function broadcastVote(io: IOServer) {
  const vote = store.vote;
  if (vote && vote.status === "OPEN") {
    io.to(ADMIN_ROOM).emit("vote:update", vote);
    io.except(ADMIN_ROOM).emit("vote:update", maskVote(vote));
  } else {
    io.emit("vote:update", vote);
  }
}

/** 지난 투표 결과 브로드캐스트 (종료된 결과이므로 전체 공개) */
function broadcastPrevious(io: IOServer) {
  io.emit("vote:previous", store.prevVote);
}

/** 일반 사용자용 스냅샷 (진행 중 투표 집계 마스킹) */
function userSnapshot() {
  const snap = store.snapshot();
  if (snap.currentVote && snap.currentVote.status === "OPEN") {
    return { ...snap, currentVote: maskVote(snap.currentVote) };
  }
  return snap;
}

export function registerSocketHandlers(io: IOServer) {
  io.on("connection", (socket: IOSocket) => {
    // 접속 즉시 현재 상태 스냅샷 전달 (기본은 사용자용 = 진행 중 집계 마스킹)
    socket.emit("state:sync", userSnapshot());
    io.emit("users:update", store.userCount);

    // ── 이모지 폭탄: 소켓별 200ms throttle 버퍼 (연타를 모아 count 로 브로드캐스트) ──
    let emojiPending: Record<string, number> = {};
    let emojiTimer: ReturnType<typeof setTimeout> | null = null;
    const flushEmoji = () => {
      const pending = emojiPending;
      emojiPending = {};
      emojiTimer = null;
      for (const [type, count] of Object.entries(pending)) {
        if (count > 0) {
          // 본인은 Optimistic UI 로 이미 표시 → 나머지에게만 전송
          socket.broadcast.emit("emoji:burst", {
            type,
            count: Math.min(EMOJI_MAX_PER_FLUSH, count),
          });
        }
      }
    };
    socket.on("emoji:send", ({ type, count }) => {
      if (!isValidEmoji(type)) return; // 화이트리스트 외 무시
      const n = Math.min(EMOJI_MAX_PER_FLUSH, Math.max(1, Math.floor(count ?? 1)));
      emojiPending[type] = (emojiPending[type] ?? 0) + n;
      if (!emojiTimer) emojiTimer = setTimeout(flushEmoji, EMOJI_THROTTLE_MS);
    });

    // ── 관리자 room 참여 (실시간 집계 수신) ──────────────────────────────
    socket.on("admin:hello", ({ adminKey }) => {
      if (!isAdmin(adminKey)) return; // 권한 없으면 조용히 무시
      socket.join(ADMIN_ROOM);
      // 관리자에게는 마스킹 없는 현재 집계를 즉시 전송
      socket.emit("vote:update", store.vote);
    });

    // ── 입장 ──────────────────────────────
    socket.on("user:join", ({ nickname, clientId, color }, ack) => {
      const clean = (nickname || "").trim().slice(0, 20);
      const cid = (clientId || "").trim();
      const col = isValidColorId(color) ? color : DEFAULT_COLOR_ID;
      if (!clean || !cid) {
        ack?.(false);
        return;
      }
      store.addUser(socket.id, cid, clean, col);
      const sysMsg = store.addMessage({
        nickname: "안내",
        message: `${clean} 님이 탑승했습니다.`,
        color: col,
        system: true,
      });
      io.emit("chat:new", sysMsg);
      io.emit("users:update", store.userCount);
      // 재접속/새로고침 대비: 현재 투표에 이미 참여했는지 개인 알림
      socket.emit("vote:voted", store.hasVoted(cid));
      ack?.(true);
    });

    // ── 채팅 ──────────────────────────────
    socket.on("chat:send", ({ message }) => {
      const user = store.getUser(socket.id);
      const text = (message || "").trim().slice(0, 300);
      if (!user || !text) return;
      const msg = store.addMessage({
        nickname: user.nickname,
        message: text,
        color: user.color,
      });
      io.emit("chat:new", msg);
    });

    // ── 투표 참여 (1인 1표) ──────────────────────────────
    socket.on("vote:cast", ({ optionId }) => {
      const user = store.getUser(socket.id);
      if (!user) return;
      const result = store.castVote(optionId, user.clientId);
      switch (result) {
        case "ok":
          socket.emit("vote:voted", true); // 투표자 본인 확정 처리
          broadcastVote(io); // 전체 집계 갱신
          break;
        case "duplicate":
          socket.emit("vote:voted", true); // 이미 투표함 → 화면 고정
          socket.emit("error:msg", "이미 투표에 참여하셨습니다.");
          break;
        case "closed":
          socket.emit("error:msg", "투표가 진행 중이 아닙니다.");
          break;
        case "invalid":
          socket.emit("error:msg", "잘못된 선택입니다.");
          break;
      }
    });

    // ── 관리자: 투표 생성/시작 ──────────────────────────────
    socket.on("admin:vote:create", ({ title, options, adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const cleanOptions = (options || [])
        .map((o) => o.trim())
        .filter(Boolean);
      if (!title?.trim() || cleanOptions.length < 2) {
        socket.emit("error:msg", "투표 제목과 최소 2개의 후보가 필요합니다.");
        return;
      }
      store.createVote(title.trim(), cleanOptions);
      const sysMsg = store.addMessage({
        nickname: "안내",
        message: `🗳️ 투표가 시작되었습니다: ${title.trim()}`,
        system: true,
      });
      io.emit("chat:new", sysMsg);
      broadcastVote(io);
      broadcastPrevious(io); // 새 투표 시작 시 지난 결과 동기화
    });

    // ── 관리자: 투표 종료 ──────────────────────────────
    socket.on("admin:vote:close", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const vote = store.closeVote();
      if (vote) {
        const sysMsg = store.addMessage({
          nickname: "안내",
          message: `✅ 투표가 종료되었습니다. 결과를 확인하세요!`,
          system: true,
        });
        io.emit("chat:new", sysMsg);
        broadcastVote(io);
      }
    });

    // ── 관리자: 초기화(다음 투표 준비) ──────────────────────────────
    socket.on("admin:vote:reset", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      store.resetVote();
      broadcastVote(io);
      broadcastPrevious(io); // 초기화 시 방금 종료된 결과를 지난 결과로 노출
    });

    // ── 관리자: 전체 초기화(지난 결과 히스토리까지 삭제) ──────────────────────────────
    socket.on("admin:reset:all", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      store.hardReset();
      broadcastVote(io); // 현재 투표 없음(null)
      broadcastPrevious(io); // 지난 결과도 없음(null) → 사용자 화면 히스토리 사라짐
    });

    // ── 관리자: 채팅 기록 초기화 ──────────────────────────────
    socket.on("admin:chat:clear", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      store.clearMessages();
      io.emit("chat:clear"); // 모든 사용자 화면의 채팅창 비움
    });

    // ── 관리자: 미니게임 생성 & 오픈 ──────────────────────────────
    socket.on("admin:game:create", ({ type, title, items, prizes, adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const game = store.createGame(type, title, items, prizes);
      if (!game) {
        socket.emit(
          "error:msg",
          type === "LADDER"
            ? "제목과 결과(2개 이상)를 입력하세요."
            : "제목과 항목(2개 이상)을 입력하세요."
        );
        return;
      }
      const label = type === "ROULETTE" ? "🎡 룰렛" : "🪜 사다리타기";
      const sysMsg = store.addMessage({
        nickname: "안내",
        message: `${label} 게임이 열렸습니다: ${game.title}`,
        system: true,
      });
      io.emit("chat:new", sysMsg);
      io.emit("game:update", game);
    });

    // ── 관리자: 게임 실행 (결과 확정 후 전원 브로드캐스트) ──────────────────────────────
    socket.on("admin:game:run", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const game = store.runGame();
      if (!game) {
        socket.emit("error:msg", "실행할 게임이 없습니다.");
        return;
      }
      io.emit("game:update", game); // 전원 동시에 결과 연출
    });

    // ── 관리자: 게임 초기화 ──────────────────────────────
    socket.on("admin:game:reset", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      store.resetGame();
      io.emit("game:update", null);
    });

    // ── 관리자: 사다리 참가자 입력 ──────────────────────────────
    socket.on("admin:game:ladder:players", ({ players, adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const game = store.setLadderPlayers(players || []);
      if (!game) {
        socket.emit("error:msg", "참가자 인원이 결과 개수와 맞지 않습니다.");
        return;
      }
      io.emit("game:update", game);
    });

    // ── 관리자: 사다리 게임 시작 ──────────────────────────────
    socket.on("admin:game:ladder:start", ({ adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const game = store.startLadder();
      if (!game) {
        socket.emit("error:msg", "참가자를 모두 입력한 뒤 시작할 수 있습니다.");
        return;
      }
      const sysMsg = store.addMessage({
        nickname: "안내",
        message: `🪜 사다리타기 시작! 하나씩 결과를 공개합니다.`,
        system: true,
      });
      io.emit("chat:new", sysMsg);
      io.emit("game:update", game);
    });

    // ── 관리자: 사다리 참가자 한 명 공개 ──────────────────────────────
    socket.on("admin:game:ladder:reveal", ({ index, adminKey }) => {
      if (!isAdmin(adminKey)) {
        socket.emit("error:msg", "관리자 권한이 없습니다.");
        return;
      }
      const game = store.revealLadder(index);
      if (!game) return;
      io.emit("game:update", game);
    });

    // ── 연결 해제 ──────────────────────────────
    socket.on("disconnect", () => {
      if (emojiTimer) clearTimeout(emojiTimer); // 이모지 throttle 타이머 정리
      const user = store.removeUser(socket.id);
      if (user) {
        const sysMsg = store.addMessage({
          nickname: "안내",
          message: `${user.nickname} 님이 떠났습니다.`,
          color: user.color,
          system: true,
        });
        io.emit("chat:new", sysMsg);
      }
      io.emit("users:update", store.userCount);
    });
  });
}
