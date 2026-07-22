# 실시간 모바일 투표 & 채팅 서비스

행사/이벤트용 가벼운 실시간 투표 시스템. **RDB 없이 서버 메모리 + Socket.io** 로 동작합니다.

## 기술 스택
- Next.js 15 (App Router) + Custom Server
- Socket.io (실시간 통신)
- Tailwind CSS (모바일 퍼스트)
- TypeScript

## 실행 방법
```bash
npm install      # 의존성 설치
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 실행
npm run lint     # 린트 검사
```

- 사용자 화면: `http://localhost:3000/`
- 관리자 화면: `http://localhost:3000/admin/<ADMIN_SLUG>` (기본 slug: `dev` → `/admin/dev`)

> 관리자는 **비밀 URL** 로만 접근합니다. slug 를 아는 사람에게만 링크를 공유하세요. (slug 불일치·`/admin` 은 404)

## 아키텍처
```
server.ts                        # Next.js + Socket.io 통합 커스텀 서버 (진입점)
src/
├── app/
│   ├── page.tsx                 # 사용자: 닉네임 입장 → 채팅 & 투표
│   └── admin/[slug]/page.tsx    # 관리자 진입점 (비밀 slug 검증 → 404)
├── components/
│   ├── VoteResult.tsx           # 투표 결과 막대그래프 (공용)
│   └── AdminConsole.tsx         # 관리자 콘솔 UI (클라이언트)
├── lib/
│   ├── types.ts                 # 도메인 타입 & 소켓 이벤트 정의
│   ├── socket.ts                # 클라이언트 소켓 싱글턴
│   └── clientId.ts              # localStorage 영구 식별자 (1인 1표)
└── server/
    ├── store.ts                 # In-Memory 상태 저장소 (싱글턴)
    └── socketHandlers.ts        # 소켓 이벤트 핸들러
```

## 환경 변수 (`.env`)
| 변수 | 설명 |
|------|------|
| `PORT` | 서버 포트 (기본 3000) |
| `ADMIN_SLUG` | 관리자 비밀 URL 경로 겸 인증 토큰. 미설정 시 `dev`. 운영 시 반드시 설정 |

## 배포 주의
Socket.io 는 상시 WebSocket 연결이 필요하므로 **Vercel 서버리스와는 호환되지 않습니다.**
Node 상시 프로세스를 지원하는 **Railway / Render / Fly.io / 자체 서버** 에 배포하세요.
(Vercel 이 꼭 필요하면 실시간 계층을 Supabase Realtime / Pusher 등으로 교체해야 합니다.)

## 특성
- 서버 재시작 시 상태가 초기화됩니다(1회성 행사용 설계).
- 투표는 중복 방지 없이 클릭당 1표로 집계됩니다(가벼움 우선).
```
