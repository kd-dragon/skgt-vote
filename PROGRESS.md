# PROGRESS.md — 진행 현황

> 최종 업데이트: 2026-07-22 (🚀 실서비스 배포 완료 · GitHub Actions 자동 배포 동작 확인)

## 배포 환경 (운영 중)
- 도메인: **skgt.fun** (Lightsail 고정 IP 연결 완료)
- SSL: **Certbot(Let's Encrypt) 적용 완료**
- 접속: `https://skgt.fun` (Nginx 443 → 127.0.0.1:3000 프록시로 포트 노출 제거) / 관리자 `https://skgt.fun/admin/<ADMIN_SLUG>`
- 구동: systemd `skgt-vote.service` (tsx 커스텀 서버, 자동 재시작)
- CI/CD: GitHub Actions — `main` push 시 러너 빌드 → rsync → 서버 재시작 자동 배포 **동작 확인 완료** ✅

## 개요
행사용 실시간 모바일 투표 & 채팅 서비스. RDB 없이 Next.js + Socket.io + In-Memory 로 구성.
사양은 `SPEC.md`, 개요/컨벤션은 `CLAUDE.md` 참고.

## ✅ 완료

### 1. 프로젝트 초안(Scaffolding)
- [x] 패키지 세팅 (`package.json`) 및 `npm install` (381 packages)
- [x] 설정 파일: `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.gitignore`, `.env.example`
- [x] Custom Server 진입점 `server.ts` (Next.js + Socket.io 통합)
- [x] 도메인/소켓 타입 정의 `src/lib/types.ts`
- [x] In-Memory 상태 저장소 `src/server/store.ts` (싱글턴)
- [x] 소켓 이벤트 핸들러 `src/server/socketHandlers.ts`
- [x] 클라이언트 소켓 싱글턴 `src/lib/socket.ts`
- [x] 사용자 화면 `src/app/page.tsx` (닉네임 입장 → 채팅 + 투표)
- [x] 관리자 화면 `src/app/admin/page.tsx` (투표 생성/종료/초기화/현황)
- [x] 투표 결과 컴포넌트 `src/components/VoteResult.tsx` (막대그래프, 👑 1위 표시)
- [x] `README.md`
- **검증**: `tsc --noEmit` 통과 / 서버 부팅 후 `/`, `/admin`, `/api/socket` 모두 200 응답

### 2. 1인 1표 제한
- [x] localStorage 영구 식별자 `src/lib/clientId.ts` 신규
- [x] `User.clientId` 추가, `user:join` 페이로드에 clientId 포함
- [x] 스토어에 `voters: Set<clientId>` 추가, `castVote` → `ok`/`closed`/`invalid`/`duplicate` 반환
- [x] 중복 투표 차단 + 사유별 안내 메시지
- [x] 재접속/새로고침 시 참여 여부 복원(`vote:voted` 개인 이벤트)
- [x] 클라이언트: 같은 투표 집계 갱신 시 voted 유지, 서버 권위값으로 상태 복원
- **검증**: 통합 테스트 PASS
  - 최초 투표 정상 집계 / 동일 사용자 재투표 차단 / 재접속 상태 복원 / 다른 사용자 정상 집계

### 3. 관리자 비밀 URL 접근
- [x] `ADMIN_KEY` → `ADMIN_SLUG` 전환 (비밀 URL 경로 겸 인증 토큰, 미설정 시 기본 `dev`)
- [x] 라우트 `/admin` → `/admin/[slug]` (서버 컴포넌트, slug 불일치 시 `notFound()`)
- [x] 관리자 UI 를 `src/components/AdminConsole.tsx`(클라이언트)로 분리, 수동 키 입력창 제거
- [x] URL slug 를 관리자 소켓 이벤트 토큰으로 자동 사용
- [x] `socketHandlers.isAdmin` 을 `ADMIN_SLUG` 기준으로 검증
- [x] 기존 `/admin/page.tsx` 삭제
- **검증**: 라우팅(올바른 URL 200 / 틀린 slug·`/admin` 404) + 소켓 인증(틀린 토큰 차단 / 올바른 slug 허용) 모두 PASS

### 4. 진행 중 집계 은닉 + 지난 결과 조회
- [x] 진행 중(OPEN)엔 사용자에게 집계를 **0으로 마스킹**하여 전송(서버 레벨 차단), 종료 시에만 전체 공개
- [x] 관리자 room(`admins`) 도입 + `admin:hello`(slug 인증)로 관리자만 실시간 집계 수신
- [x] `state:sync`/`vote:update` 모두 사용자용은 마스킹, 관리자용은 실집계
- [x] 사용자 화면: 진행 중 투표 완료 시 "결과는 종료 후 공개" 안내(집계 숨김)
- [x] `previousVote` 보존(생성/초기화 시) + `vote:previous` 이벤트, 사용자 화면 "📊 지난 투표 결과"(펼쳐보기)
- [x] 관리자 화면엔 히스토리 미표시(요구사항)
- **검증**: 통합 테스트 12/12 PASS (진행 중 관리자만 집계 확인·사용자 마스킹 / 종료 시 전체 공개 / 초기화·새 투표 후 지난 결과 유지 / 신규 접속 스냅샷 마스킹+지난 결과 수신)

### 5. 결과 발표 화면 전환/애니메이션 (사용자 화면, 풀 연출)
- [x] `src/components/ResultReveal.tsx` 신규: 전체화면 발표 오버레이
  - 드럼롤 서스펜스(🥁, 1.6s) → 막대 차오름 + 숫자 카운트업(rAF) → 1위 👑 bounce + 색종이(confetti)
- [x] `globals.css` 순수 CSS keyframes 추가(fade/pop/drum-pulse/crown-bounce/confetti-fall) + `prefers-reduced-motion` 대응
- [x] 사용자 페이지: `OPEN→CLOSED` 전환 감지(voteRef) 시 오버레이 자동 등장, 닫기 버튼으로 채팅 복귀
- [x] 진행 중 입장자도 종료 시 발표 노출(state:sync에서 voteRef 갱신)
- **검증**: `tsc` 통과 / 사용자·관리자 페이지 컴파일 200, 런타임 오류 없음
- **미검증(수동 확인 필요)**: 애니메이션 육안 확인 (Chrome 확장 미설치로 자동 캡처 생략)

### 6. AWS Lightsail(Ubuntu 512MB/2vCPU/20GB) 배포 준비
- [x] `tsx` 를 devDependencies → **dependencies** 이동 (프로덕션 런타임에 필요)
- [x] `deploy/skgt-vote.service` — systemd 유닛 (tsx 직접 구동, 자동 재시작, journald 로그)
- [x] `deploy/nginx-skgt-vote.conf` — Nginx 리버스 프록시 + WebSocket 업그레이드
- [x] `deploy/env.production.example` — 프로덕션 환경변수 예시
- [x] `deploy/update.sh` — 재배포 스크립트(npm ci → build → restart)
- [x] `DEPLOY.md` — 단계별 런북 (스왑2GB→Node20→rsync→build→systemd→Nginx→Certbot HTTPS)
- **검증**: `next build` 성공(로컬) / 프로덕션 모드 구동(dev=false) 시 사용자 200·관리자 slug 200·틀린 slug 404·socket.io 200
- **미완료(사용자 실행)**: 실제 Lightsail 서버 SSH 배포 (런북대로 직접 수행 필요)

### 7. skgt.fun 도메인 · 포트 없는 접속 (리버스 프록시)
- [x] `deploy/nginx-skgt-vote-ssl.conf` — skgt.fun 최종 Nginx 설정(80→443 리다이렉트 + 443 SSL + 3000 프록시 + WebSocket)
- [x] `DEPLOY.md` 도메인 skgt.fun 반영 + "12. 포트 3000 없이 접속" 섹션(진단·교체·확인 절차) 추가
- **핵심**: 코드 수정 없이 Nginx 443→127.0.0.1:3000 프록시로 `https://skgt.fun`(포트 없음) 접속. 앱은 origin 기준 `wss://skgt.fun/api/socket` 자동 사용
- [x] 서버 Nginx 적용 확인 완료: `sites-enabled/skgt.fun`에 Certbot 관리 443 SSL 블록(인증서 경로 정상) + 3000 프록시 + WebSocket 헤더, 80→443 리다이렉트(skgt.fun/www) 모두 반영됨
- **남은 확인(사용자)**: `curl -I https://skgt.fun/` 200 및 브라우저 실시간 동작 최종 확인 (502 시 앱 서비스 기동 점검)

### 8. GitHub Actions CI/CD (러너 빌드 → rsync → 서버 재시작)
- [x] `.github/workflows/deploy.yml` — main push/수동 실행 시: 러너에서 `npm ci`+`next build` → `.next`/소스 rsync → 서버 `npm ci --omit=dev` + `systemctl restart` → HTTPS 200 확인
- [x] 512MB 서버에서 빌드하지 않음(러너 빌드), systemd 유닛/ADMIN_SLUG 는 CI가 건드리지 않음(비밀 유지)
- [x] `.gitignore` 에 `.claude/` 추가(개인 저장소 push 시 로컬 도구 제외)
- [x] `DEPLOY.md` 13번 섹션: 배포키 생성/서버 등록, NOPASSWD sudo, git init/push, GitHub Secrets(`LIGHTSAIL_HOST/USER/SSH_KEY`)
- [x] GitHub 저장소 생성 & 최초 push 완료 (**public** 저장소)
  - 보안 감사 클린: 추적 파일에 `.env`/`node_modules`/`.claude`/`.next` 없음, 하드코딩 비밀값 없음(`ADMIN_SLUG`은 서버 systemd에만, SSH키는 GitHub Secrets에만). public이어도 안전 — 단 `ADMIN_SLUG`는 길고 랜덤 유지 필수.
- **미완료(사용자 실행)**: GitHub Secrets 등록, 배포키 서버 authorized_keys 등록 → 첫 자동 배포 확인

### 9. ADMIN_SLUG 를 GitHub Secret 으로 관리 (CI가 서버 .env 기록)
- [x] systemd 유닛: `Environment=ADMIN_SLUG` 제거 → `EnvironmentFile=-/home/ubuntu/skgt-vote/.env` 로 로드(파일 없으면 기본 "dev")
- [x] 워크플로우: rsync 후 GitHub Secret `ADMIN_SLUG` 를 파일로 만들어 서버 `.env` 로 scp(명령줄/로그 미노출), 이어서 `npm ci --omit=dev` + restart
- [x] `.env` 는 .gitignore + rsync 제외 → 저장소 미노출 & 서버 보존
- [x] DEPLOY.md: Secret 표에 `ADMIN_SLUG` 추가, Step5/6(수동 .env 또는 CI 자동) 갱신
- **주의**: `socketHandlers.ts` 가 모듈 로드 시점에 `process.env.ADMIN_SLUG` 를 읽으므로 반드시 systemd EnvironmentFile 로 주입(Next .env 자동로드에 의존 X)

### 10. 어몽어스 테마 + 관리자 전체 초기화
- [x] 오리지널 크루원 SVG(`Crewmate.tsx`) + 12색 팔레트(`crewmates.ts`) — 공식 에셋 미사용, 인라인 SVG
- [x] 입장 화면: 닉네임 + 캐릭터(색상) 선택 그리드, localStorage 저장/복원
- [x] `User`/`ChatMessage`에 `color` 추가, `user:join`에 color 전달 → 채팅·입장/퇴장 안내에 크루원 표시
- [x] 사용자 화면 전체 우주 테마(`space-bg` 별 배경, `au-btn` 3D 버튼, float 애니메이션), `VoteResult` dark 모드
- [x] 관리자 **전체 초기화** 버튼: `admin:reset:all` → `store.hardReset()`(현재+지난 결과+투표자 삭제) → 사용자 화면 '지난 투표 결과' 배너 제거
- **검증**: `tsc` 통과 / `next build` 성공. **육안(브라우저) 확인은 사용자 몫**(테마/캐릭터 렌더)

### 11. 관리자 전체 채팅 기록 초기화
- [x] `store.clearMessages()` — 서버 메모리 채팅 배열 비움 (투표/투표자에는 영향 없음)
- [x] 소켓 이벤트: `admin:chat:clear`(client→server, slug 인증) / `chat:clear`(server→client 브로드캐스트)
- [x] `socketHandlers.admin:chat:clear` → `store.clearMessages()` 후 `io.emit("chat:clear")`
- [x] 사용자 화면(`page.tsx`): `chat:clear` 구독 → `setMessages([])`로 채팅창 즉시 비움
- [x] 관리자 콘솔(`AdminConsole.tsx`): '채팅 관리' 구역에 **💬 전체 채팅 기록 초기화** 버튼(confirm 후 실행)
- **검증**: `tsc --noEmit` 통과. **육안(브라우저) 확인은 사용자 몫**

### 12. 긴급 투표(Emergency Meeting) 등장 애니메이션
- [x] `EmergencyMeeting.tsx` 신규: 어몽어스풍 긴급회의 오버레이(빨간 경고 플래시 + 화면 흔들림 + 크루원 난입 + 큰 텍스트 팝), 2.9s 후 자동 종료·탭 시 즉시 스킵
- [x] `globals.css` keyframes 추가: `em-shake`/`em-flash`/`em-crew-in`/`em-text-in`/`em-spin`(속도선) + `prefers-reduced-motion` 대응
- [x] 투표 버튼 디자인 변경: 블루→흰 배경·진한 글씨, 가운데 정렬 테두리 박스(`max-w-xs`)로 양쪽 여백 구분
- [x] `page.tsx`: `vote:update`에서 OPEN & 새 ID 감지 시 `setMeetingVote` → 오버레이 등장(난입 크루원은 접속자 본인 색)
- **검증**: `tsc --noEmit` 통과. **애니메이션 육안 확인은 사용자 몫**

### 13. 동률 처리 + 동점 재투표
- [x] `ResultReveal.tsx`: 왕관 조건을 `idx===0`→`count===maxCount`로 수정 → 동점자 전원 👑 (VoteResult는 이미 동률 지원)
- [x] `AdminConsole.tsx`: 종료 투표에서 최다 득표 공유 후보(2개↑) 계산 → **👑 동점 재투표** 버튼을 '새 투표 준비' 옆에 노출
- [x] 동점 재투표는 별도 서버 이벤트 없이 기존 `admin:vote:create` 재사용(동점 후보 label 만 옵션으로, 제목 `~ (재투표)`) → 긴급 투표 오버레이도 그대로 동작, 직전 결과는 지난 결과로 보존
- **검증**: `tsc --noEmit` 통과. **육안 확인은 사용자 몫**

### 14. 오래된 채팅 자동 정리 (메모리 보호)
- [x] `store.pruneMessages()` 신규: TTL(기본 60분) 초과 메시지를 앞에서부터 제거 + 기존 개수 상한(200개) 하드 실링 유지
- [x] `addMessage`/`snapshot` 에서 정리 호출 → 신규 접속자에게도 만료 채팅 미노출, 유휴 시엔 최대 200개(수십 KB)만 상주
- [x] TTL 은 `CHAT_TTL_MIN` 환경변수로 조정(미설정 시 60분), `.env.example`·`deploy/env.production.example` 문서화
- **검증**: `tsc --noEmit` 통과

### 15. QA 버그 수정 (한글 IME 중복 입력 · 신규 접속 스크롤)
- [x] 채팅/닉네임 입력: `onKeyDown`에 `e.nativeEvent.isComposing` 가드 → 한글 조합 중 Enter 시 마지막 글자 중복 입력 방지
- [x] 신규 접속 시 채팅창이 맨 위에 머물던 문제: `joined` 전환 effect 추가로 입장 즉시 최신(맨 아래)으로 점프(`behavior:auto`)
- **검증**: `tsc --noEmit` 통과

### 16. 미니게임 추가: 룰렛 + 사다리타기 (관리자 실행·전원 관전, 어몽어스 테마)
- [x] 타입(`types.ts`): `Game`(RouletteGame|LadderGame) + 이벤트 `admin:game:create/run/reset`, `game:update`, 스냅샷에 `currentGame`
- [x] 서버(`store.ts`): `createGame`/`runGame`(서버 권위 랜덤)/`resetGame`, 사다리 가로줄 랜덤 생성·경로 계산, `hardReset`에 게임 포함
- [x] 서버(`socketHandlers.ts`): slug 인증 + 생성/실행/초기화 핸들러, 생성 시 안내 채팅
- [x] 룰렛 연출(`RouletteReveal.tsx`): 크루원 색 세그먼트 원판이 회전(ease-out 4.2s)해 당첨 정지 → 👑+색종이(기존 CSS 재활용)
- [x] 사다리 연출(`LadderReveal.tsx`): 크루원 토큰들이 사다리를 rAF로 동시 하강 → 도착 결과 강조 + 매핑 목록
- [x] 등장 연출: `EmergencyMeeting`을 `heading/subheading` prop으로 일반화해 게임 오픈 시 "🎡 룰렛 게임! / 🪜 사다리타기!" 재활용
- [x] 사용자 화면(`page.tsx`): `game:update` 구독, OPEN 대기 배너 + 새 게임 등장 오버레이 + OPEN→RESULT 전환 시 전체화면 결과 연출('결과 다시 보기' 포함), 재접속 시 연출 재생 없이 상태만 복원
- [x] 관리자(`AdminConsole.tsx`): 모드 탭(투표/룰렛/사다리) + 각 생성폼/실행/초기화, 사다리는 참가자·결과 2열(개수 동일 강제)
- **검증**: `tsc --noEmit`·`next lint` 통과 (프로덕션 `next build`는 로컬 dev 서버의 `.next` 파일 락으로 미실행 — 코드 무관). **애니메이션 육안 확인은 사용자 몫**

### 17. 사다리 게임 재설계 (단계 진행형: 결과 가림 → 참가자 입력 → 하나씩 공개)
- [x] 타입: `LadderGame`에 `revealed[]` 추가, `GameStatus`에 `PLAYING` 추가. 생성은 **결과만** 입력, 참가자는 이후 입력
- [x] 서버(`store.ts`): `createGame`(사다리=결과-only, 참가자 빈칸), `setLadderPlayers`/`startLadder`(매핑 확정·PLAYING)/`revealLadder`(index 누적), `runGame`은 룰렛 전용으로 축소
- [x] 서버(`socketHandlers.ts`): `admin:game:ladder:players/start/reveal` 핸들러(slug 인증), 시작 시 안내 채팅
- [x] 사용자 보드(`LadderBoard.tsx` 신규, 인페이지): 사다리 길(세로줄+가로대) 노출 + **하단 결과 ❓ 가림**, 관리자가 공개할 때마다 해당 크루원 토큰이 rAF로 하강→도착 결과칸 공개. 재접속 시 이미 공개된 참가자는 애니 없이 즉시 표시. 기존 전체화면 `LadderReveal.tsx` 제거
- [x] 관리자(`AdminConsole.tsx`): 사다리 생성=결과만 / OPEN=참가자 입력칸+‘보드 반영’+‘게임 시작’ / PLAYING=참가자별 ‘하나씩 공개’ 버튼(공개 시 도착 결과 표기)
- [x] `page.tsx`: 사다리는 RESULT 전체화면 대신 배너에 `LadderBoard` 상시 노출(공개 n/N 안내), 룰렛은 기존 RESULT 오버레이 유지
- [x] (조정) 가로대 개수 2배(`rows = max(16, cols*4)`) / 결과는 **항상 표시**하고 대신 **사다리 중간에 네모난 가림막**을 토큰·가로대 위에 덮어 경로 예측 방지(도착 시 결과칸 강조)
- [x] (조정) 가림막은 **대기(OPEN) 중에만** 표시 → 하나씩 공개(PLAYING) 시작하면 치워서 전체 경로 하강이 보임
- [x] (조정) 룰렛 회전을 CSS 트랜지션 → **rAF 감속 이징**(5제곱 ease-out)으로 변경: 마찰 감속처럼 처음 빠르게 → 부드럽게 느려지며 정지(회전 10s·8바퀴)
- [x] (조정) 관리자 탭(투표/룰렛/사다리) 이동 시 진행 중 투표·게임이 있으면 **확인창 → 종료**(동시 진행 방지): `handleTabChange` 에서 `admin:vote:reset`/`admin:game:reset` emit
- **검증**: `tsc --noEmit`·`next lint` 통과. **애니메이션 육안 확인은 사용자 몫**

### 18. 실시간 이모지 폭탄 (Emoji Rain)
- [x] 공용 상수 `src/lib/emojis.ts`(❤️🔥🎉👏 + `isValidEmoji` 화이트리스트)
- [x] 타입: client→server `emoji:send {type,count?}` / server→client `emoji:burst {type,count}`
- [x] 서버(`socketHandlers.ts`): **소켓별 200ms throttle 버퍼**로 연타를 count 로 집계 → `socket.broadcast`(본인 제외) 전송, 화이트리스트·개수 클램프(≤40), disconnect 시 타이머 정리
- [x] 클라(`EmojiRain.tsx`): floating 버튼(채팅 입력창 위) + 파티클 오버레이(CSS keyframes `emoji-rise`, 아래→위 둥둥+좌우 drift), **Optimistic**(누른 본인 즉시 스폰) + 파티클 상한 100개/스폰 30개로 성능 보호, `prefers-reduced-motion` 대응
- [x] `page.tsx` 입장 화면에 `<EmojiRain />` 마운트
- [x] (조정) 진행 중에도 이모지 활성 유지하되 **레이어로 분리**: 이모지 파티클은 z-30, 헤더·투표 배너·게임 배너·입력창은 `relative z-40`로 올려 이모지가 패널 **뒤로** 지나가게(가림 방지). 패널의 `backdrop-blur`로 뒤 이모지는 은은하게 블러됨
- **검증**: `tsc --noEmit`·`next lint` 통과. **육안 확인은 사용자 몫**

### 19. 사용자 채팅방 퇴장 버튼
- [x] 헤더 우측 상단 **🚪 퇴장** 버튼 → 확인창 후 초기(닉네임/캐릭터 선택) 화면 복귀(`setJoined(false)`)
- [x] 이벤트 `user:leave`(client→server): 서버가 `removeUser` + 퇴장 안내 채팅 + 인원수 갱신(소켓은 유지, 방에서만 나감 → 재입장 시 `user:join` 재사용)
- **검증**: `tsc --noEmit` 통과

## ✅ 배포 완료
- [x] **실제 Lightsail 배포 수행** — GitHub Actions 자동 배포로 `https://skgt.fun` 서비스 운영 중

## 🔜 다음 후보 (미착수)
- [ ] 관리자 인증 추가 강화 (세션/미들웨어/rate-limit) — 현재 비밀 slug 방식
- [ ] 채팅/투표 소켓 rate-limit (도배 방지)
- [ ] 1인 1표 강화 (IP 기반 / 사전 발급 코드)
- [ ] 다중 방(이벤트) 지원
- [ ] `npm run lint` 정식 실행 및 정리

## ⚠️ 알려진 제약
- 상태가 서버 메모리에만 존재 → 서버 재시작 시 전체 초기화(1회성 행사용 설계).
- 1인 1표는 브라우저 localStorage 기준 → 다른 브라우저/시크릿창은 별도 사용자로 인식.
- Socket.io 특성상 Vercel 서버리스 배포 불가 → Node 상시 프로세스 호스트 필요.
- Windows 로컬 테스트 시 `localhost` 대신 `127.0.0.1` 사용 권장(IPv6 해석 이슈).

## 파일 맵
| 파일 | 역할 |
|------|------|
| `server.ts` | Next + Socket.io 통합 진입점 |
| `src/lib/types.ts` | 도메인 + 소켓 이벤트 타입 |
| `src/lib/socket.ts` | 클라이언트 소켓 싱글턴 |
| `src/lib/clientId.ts` | localStorage 영구 식별자 |
| `src/server/store.ts` | In-Memory 상태 싱글턴 |
| `src/server/socketHandlers.ts` | 소켓 이벤트 핸들러 |
| `src/app/page.tsx` | 사용자 화면 |
| `src/app/admin/[slug]/page.tsx` | 관리자 진입점(비밀 slug 검증→404) |
| `src/components/AdminConsole.tsx` | 관리자 콘솔 UI(클라이언트) |
| `src/components/VoteResult.tsx` | 투표 결과 막대그래프 |
| `src/components/ResultReveal.tsx` | 결과 발표 전체화면 오버레이(애니메이션) |
