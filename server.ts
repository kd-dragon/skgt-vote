import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/types";
import { registerSocketHandlers } from "@/server/socketHandlers";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

// Next.js 앱 준비
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  // Next.js 요청 처리를 감싸는 HTTP 서버
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // 동일 HTTP 서버에 Socket.io 부착 (RDB 없이 실시간 통신 담당)
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: "/api/socket",
    cors: { origin: "*" },
  });

  registerSocketHandlers(io);

  httpServer.listen(port, () => {
    const slug = process.env.ADMIN_SLUG || "dev";
    console.log(`▶ 서버 실행: http://localhost:${port}  (dev=${dev})`);
    console.log(`  - 사용자 화면: http://localhost:${port}/`);
    console.log(`  - 관리자 화면: http://localhost:${port}/admin/${slug}`);
  });
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
