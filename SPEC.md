# SPEC.md — 행사용 실시간 모바일 투표 & 채팅 서비스

> 이 문서는 구현 사양을 정의합니다. 프로젝트 개요/컨벤션은 `CLAUDE.md`, 진행 현황은 `PROGRESS.md` 참고.

## 1. 목적
이벤트/행사 중 **베스트 조 / 베스트 인원(MVP)** 선정을 위한 가벼운 실시간 투표 시스템.
로그인 없이 모바일 웹 링크로 접속하여 익명 채팅 + 실시간 투표에 참여한다.

## 2. 기술 스택
| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | Custom Server 모드 |
| 언어 | TypeScript | strict |
| 실시간 | Socket.io 4 | WebSocket + polling fallback |
| 상태 저장 | 서버 In-Memory (싱글턴) | **RDB 없음** |
| 스타일 | Tailwind CSS 3 | 모바일 퍼스트 |
| 서버 실행 | tsx | `server.ts` 직접 구동 |

> ⚠️ Socket.io는 상시 연결이 필요 → **Vercel 서버리스 미지원**. Node 상시 프로세스 호스트 필요.
> **배포 대상**: AWS Lightsail(Ubuntu). 구성·절차는 `DEPLOY.md`, 자산은 `deploy/` 참고 (Nginx 프록시 + systemd + Certbot HTTPS).

## 3. 화면(라우트)
| 경로 | 대상 | 기능 |
|------|------|------|
| `/` | 사용자 | 닉네임 입장 → 실시간 채팅 + 투표 참여/현황 |
| `/admin/<slug>` | 관리자 | 비밀 slug 경로로만 접근. 투표 생성/시작 → 현황 → 종료 → 결과 → 초기화 |

> 관리자 화면은 **비밀 URL(`/admin/<ADMIN_SLUG>`)** 로만 접근한다. slug 불일치 시 404. `/admin`(slug 없음)도 404. URL 을 아는 사람에게만 링크를 공유하면 된다.

## 4. 도메인 데이터 구조 (In-Memory)
```ts
RoomStatus = "WAITING" | "VOTING" | "CLOSED"   // 파생값(현재 투표 상태 기준)

User        { id(socket), clientId(localStorage 영구), nickname, joinedAt }
VoteOption  { id, label }
Vote        { id, title, options[], status: OPEN|CLOSED, results: {optionId->count}, createdAt }
ChatMessage { id, nickname, message, timestamp, system? }
```
- 저장소는 **단일 방(Room)** 싱글턴(`src/server/store.ts`). 서버 재시작 시 전체 초기화.
- 직전 종료 투표는 `previousVote`로 1건 보존(지난 결과 조회용). 투표 생성/초기화 시 갱신.
- 채팅 메시지는 메모리 보호를 위해 최근 **200개**만 보관.
- 투표 참여자 명단은 `voters: Set<clientId>`로 관리(1인 1표 판별용, 클라이언트에 노출 안 함).

## 5. 실시간 이벤트 규약 (Socket.io, path `/api/socket`)

### 클라이언트 → 서버
| 이벤트 | 페이로드 | 설명 |
|--------|----------|------|
| `user:join` | `{ nickname, clientId }` + ack | 입장. 닉네임 20자 제한. 성공 시 ack(true) |
| `chat:send` | `{ message }` | 채팅 전송. 300자 제한 |
| `vote:cast` | `{ optionId }` | 투표. 서버가 clientId로 1인 1표 검증 |
| `admin:hello` | `{ adminKey? }` | 관리자 인증 후 실시간 집계 room 참여 |
| `admin:vote:create` | `{ title, options[], adminKey? }` | 투표 생성(최소 2개 후보) |
| `admin:vote:close` | `{ adminKey? }` | 투표 종료 |
| `admin:vote:reset` | `{ adminKey? }` | 투표 초기화(다음 투표 준비) |

### 서버 → 클라이언트
| 이벤트 | 페이로드 | 설명 |
|--------|----------|------|
| `state:sync` | `StateSnapshot` | 접속 즉시 전체 상태 스냅샷 |
| `chat:new` | `ChatMessage` | 신규 채팅/시스템 메시지 브로드캐스트 |
| `users:update` | `number` | 접속자 수 갱신 |
| `vote:update` | `Vote \| null` | 투표 생성/집계/종료 브로드캐스트 (OPEN 시 사용자에겐 집계 마스킹) |
| `vote:previous` | `Vote \| null` | 직전 종료 투표 결과 (사용자 조회용) |
| `vote:voted` | `boolean` | **개인 통지**: 현재 투표 참여 여부(재접속 복원용) |
| `error:msg` | `string` | 오류 안내 |

## 5-1. 집계 공개 정책
- **진행 중(OPEN)**: 일반 사용자에게는 집계를 **0으로 마스킹**하여 전송(중간 현황 비공개). 관리자만 실시간 집계 확인.
  - 관리자는 `admin:hello`(비밀 slug)로 서버의 `admins` room 에 참여 → 마스킹 없는 집계 수신.
  - `broadcastVote`가 OPEN 시 `io.to(admins)`엔 실집계, `io.except(admins)`엔 마스킹본을 전송.
- **종료(CLOSED)**: 전체에게 실제 결과 공개(최종 발표).
- **지난 결과**: 종료된 직전 투표를 `previousVote`로 보존 → 사용자 화면에서 "📊 지난 투표 결과"로 조회. 관리자 화면엔 히스토리 미표시.
- **발표 연출**: 사용자 화면은 `OPEN→CLOSED` 전환 시 전체화면 오버레이(`ResultReveal`)로 발표 — 드럼롤 → 막대 차오름/숫자 카운트업 → 1위 👑 + 색종이. 순수 CSS 애니메이션, `prefers-reduced-motion` 대응.

## 6. 핵심 규칙
- **1인 1표**: `clientId`(브라우저 localStorage 영구값) 기준. `castVote` 결과는 `ok`/`closed`/`invalid`/`duplicate`.
  - 재접속·새로고침 시 서버가 `vote:voted`로 참여 여부를 복원하여 재투표를 막는다.
  - 한계: 다른 브라우저/시크릿창은 별도 사용자로 인식(로그인 없는 경량 수준의 제한).
- **관리자 인증(비밀 URL 방식)**: 환경변수 `ADMIN_SLUG` 값이 곧 비밀 URL 경로이자 백엔드 인증 토큰.
  - 화면: `/admin/[slug]` 서버 컴포넌트가 `slug !== ADMIN_SLUG` 이면 `notFound()`(404).
  - 백엔드: 관리자 소켓 이벤트는 페이로드 `adminKey`(=URL slug)를 `ADMIN_SLUG` 와 대조해 검증 → URL 만 숨기는 게 아니라 이벤트 직접 호출도 차단.
  - `ADMIN_SLUG` 미설정 시 개발용 기본값 `dev` (→ `/admin/dev`). 운영 시 반드시 설정.
- **투표 상태 전이**: `WAITING`(투표 없음) → `VOTING`(OPEN) → `CLOSED`(종료). reset 시 다시 `WAITING`.
- **모바일 퍼스트**: 뷰포트 확대 방지, 100dvh 대응, 터치 친화 버튼 크기.

## 7. 환경 변수
| 변수 | 기본 | 설명 |
|------|------|------|
| `PORT` | 3000 | 서버 포트 |
| `ADMIN_SLUG` | `dev` | 관리자 비밀 URL 경로 겸 인증 토큰. 운영 시 반드시 설정 |

## 8. 디렉터리 구조
```
server.ts                      # Next.js + Socket.io 통합 진입점
src/
├── app/
│   ├── layout.tsx / globals.css
│   ├── page.tsx               # 사용자 화면
│   └── admin/[slug]/page.tsx  # 관리자 진입점(서버 컴포넌트, slug 검증→404)
├── components/
│   ├── VoteResult.tsx         # 투표 결과 막대그래프(공용)
│   └── AdminConsole.tsx       # 관리자 콘솔 UI(클라이언트)
├── lib/
│   ├── types.ts               # 도메인 + 소켓 이벤트 타입
│   ├── socket.ts              # 클라이언트 소켓 싱글턴
│   └── clientId.ts            # localStorage 영구 식별자
└── server/
    ├── store.ts               # In-Memory 상태 싱글턴
    └── socketHandlers.ts      # 소켓 이벤트 핸들러
```

## 9. 명령어
```bash
npm install     # 의존성 설치
npm run dev     # 개발 서버 (tsx watch)
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 실행
npm run lint    # 린트
```

## 10. 향후 확장(백로그)
- 관리자 인증 추가 강화(세션/미들웨어/rate-limit) — 현재는 비밀 slug 방식
- 결과 발표용 화면 전환/애니메이션
- 1인 1표 강화(IP/사전 발급 코드)
- Vercel 배포용 실시간 계층 교체(Supabase Realtime / Pusher)
- 다중 방(이벤트) 지원
