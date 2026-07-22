# 행사용 실시간 모바일 투표 & 채팅 서비스 (Event Voting App)

## 1. 프로젝트 개요 (Overview)
- **목적**: 이벤트/행사 중 베스트 조 및 베스트 인원(MVP) 선정을 위한 가벼운 실시간 투표 시스템
- **주요 기능**:
  - **사용자**: 모바일 웹 링크(URL)로 접속 ➔ 닉네임 입력 후 입장 ➔ 실시간 익명 채팅 ➔ 진행 중인 투표 참여
  - **관리자**: 수동으로 투표 생성/시작 ➔ 실시간 투표 현황 확인 ➔ 투표 수동 종료 ➔ 결과 화면 공개

## 2. 추천 기술 스택 (Tech Stack)
> RDB 없이 가볍고 빠른 실시간 반응성을 위해 구성된 스택입니다.
- **Frontend / Backend**: Next.js (App Router, Node.js runtime)
- **Realtime / In-Memory State**: Socket.io (또는 Supabase Realtime / Firebase Realtime DB)
  - 별도 RDB 구축 없이 서버 메모리(In-Memory Map/Set)나 간단한 실시간 DB 활용
- **Styling**: Tailwind CSS (모바일 퍼스트 UI/UX)
- **Deployment**: Vercel (간단한 링크 공유 및 빠른 배포)

## 3. 핵심 도메인 데이터 구조 (In-Memory Data Concept)
- **Room/Event**: 현재 진행 중인 행사 상태 (대기 중, 투표 진행 중, 투표 종료)
- **User**: `id`, `nickname`, `joinedAt`
- **Vote**: `id`, `title` (예: 베스트 조 투표), `options` (조/후보 리스트), `status` (OPEN / CLOSED), `results` (`optionId` -> `count`)
- **ChatMessage**: `id`, `nickname`, `message`, `timestamp`

## 4. 자주 쓰는 명령어 (Commands)
- **의존성 설치**: `npm install`
- **로컬 개발 실행**: `npm run dev`
- **빌드**: `npm run build`
- **스타일/린트 검사**: `npm run lint`

## 5. 개발 가이드라인 & 컨벤션 (Guidelines)
- **모바일 웹 최적화**: 사용자가 주로 스마트폰 브라우저로 접속하므로 Breakpoint 및 터치 UI(패딩, 버튼 크기)에 신경 쓸 것.
- **아키텍처**: 
  - `/admin`: 관리자용 페이지 (투표 생성, 시작, 종료, 결과 통계 컨트롤)
  - `/`: 사용자용 접속 페이지 (닉네임 설정 -> 채팅 & 투표 대기/참여)
- **실시간 처리**: 웹소켓(Socket) 이벤트를 활용해 관리자가 투표를 시작/종료하면 사용자 화면에 실시간 팝업이나 화면 전환이 즉시 일어날 것.
- **복잡도 최소화**: 로그인/회원가입 절차 없이 Session/LocalStorage 및 닉네임 기반으로 가볍게 처리할 것.
- **언어**: 코드 주석 및 AI 응답은 한국어로 작성할 것.

## 6. 작업 방식 (Workflow)
- **큰 변경은 계획 먼저**: 규모가 큰 변경은 먼저 계획을 보여주고 승인받은 뒤 진행할 것.
- **작업 종료 시 기록**: 매 작업 종료 시 `PROGRESS.md`를 갱신할 것.
- **세션 시작 시 맥락 파악**: 세션 시작 시 `SPEC.md`와 `PROGRESS.md`를 먼저 읽고 맥락을 파악할 것.