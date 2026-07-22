# DEPLOY.md — AWS Lightsail(Ubuntu) 배포 런북

대상: Lightsail Ubuntu **512MB RAM / 2 vCPU / 20GB SSD** 1대
구성: `인터넷 → Nginx(80/443) → Node 커스텀 서버(127.0.0.1:3000, systemd) `
배포 자산: `deploy/` 폴더 (`skgt-vote.service`, `nginx-skgt-vote.conf`, `nginx-skgt-vote-ssl.conf`(skgt.fun 최종본), `env.production.example`, `update.sh`)

> ⚠️ **512MB 주의**: `next build` 는 메모리를 많이 쓴다. **반드시 스왑(2GB)을 먼저 만들고** 빌드할 것. (Step 2)

---

## 0. 사전 준비 (로컬/콘솔)
1. **고정 IP**: Lightsail 콘솔에서 인스턴스에 **Static IP** 할당.
2. **DNS**: 보유 도메인의 A 레코드를 그 Static IP 로 지정 (예: `skgt.fun → 1.2.3.4`). 전파까지 수 분~수십 분.
3. **방화벽(Lightsail Networking)**: 인바운드 규칙에 **HTTP(80)**, **HTTPS(443)** 추가. **SSH(22)** 는 기본 존재. **3000 포트는 열지 말 것**(내부 전용).

아래 명령의 `skgt.fun` 은 실제 도메인으로 바꿔서 실행한다.

---

## 1. 서버 접속 & 기본 업데이트
```bash
ssh ubuntu@<STATIC_IP>

sudo apt update && sudo apt upgrade -y
```

## 2. 스왑 2GB 생성 (빌드 OOM 방지 — 필수)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# 재부팅 후에도 유지
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # Swap: 2.0Gi 확인
```

## 3. Node.js 20 LTS + 도구 설치
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git rsync
node -v && npm -v   # v20.x 확인
```

## 4. 코드 업로드
이 프로젝트는 Git 저장소가 아니므로 **로컬에서 rsync** 로 올린다. (또는 GitHub 등에 올렸다면 `git clone`)

**로컬 PC(Windows Git Bash 또는 PowerShell의 wsl/rsync)에서 실행:**
```bash
# 프로젝트 루트(D:\workspace\skgt-vote)에서
rsync -avz --exclude node_modules --exclude .next --exclude .git \
  ./ ubuntu@<STATIC_IP>:/home/ubuntu/skgt-vote/
```
> rsync 가 없으면: 로컬에서 `node_modules`/`.next` 를 제외하고 zip → `scp` 로 전송 후 서버에서 압축 해제.

## 5. 환경변수(ADMIN_SLUG) 설정
`ADMIN_SLUG` 은 **서버의 `.env` 파일**에서 로드된다(systemd `EnvironmentFile`). 두 가지 방식 중 하나:

- **CI 사용(권장)**: GitHub Secret `ADMIN_SLUG` 에 값을 넣으면, 배포 때마다 CI가 서버 `.env` 를 자동 기록한다 → **서버에서 수동 작업 불필요**. (Step 13-D 참고)
- **수동(CI 미사용)**: 서버에서 직접 생성:
```bash
cd /home/ubuntu/skgt-vote
umask 077
printf 'ADMIN_SLUG=%s\n' "$(openssl rand -hex 12)" > .env
cat .env    # 값 확인 후 관리자 URL 로 사용
```

## 6. systemd 서비스 등록
```bash
# 유닛 파일 복사 (ADMIN_SLUG 는 유닛이 아니라 .env 에서 로드하므로 치환 불필요)
sudo cp /home/ubuntu/skgt-vote/deploy/skgt-vote.service /etc/systemd/system/skgt-vote.service

# User/경로(ubuntu, /home/ubuntu/skgt-vote)와 EnvironmentFile 경로 확인
grep -E "User|WorkingDirectory|EnvironmentFile|ExecStart" /etc/systemd/system/skgt-vote.service
```

## 7. 의존성 설치 & 빌드
```bash
cd /home/ubuntu/skgt-vote
npm ci                                  # 전체 설치(빌드에 devDeps 필요)
NODE_OPTIONS="--max-old-space-size=1536" npm run build
```
> 빌드 중 멈추거나 `Killed` 가 뜨면 스왑(Step 2)이 활성인지 `free -h` 로 재확인.

## 8. 서비스 시작
```bash
sudo systemctl daemon-reload
sudo systemctl enable skgt-vote
sudo systemctl start skgt-vote
sudo systemctl status skgt-vote --no-pager   # active (running) 확인

# 로컬 응답 확인
curl -I http://127.0.0.1:3000/              # 200 이면 정상
```

## 9. Nginx 설치 & 리버스 프록시
```bash
sudo apt install -y nginx

# 사이트 설정 복사 후 도메인 치환
sudo cp /home/ubuntu/skgt-vote/deploy/nginx-skgt-vote.conf /etc/nginx/sites-available/skgt-vote
sudo sed -i 's/your-domain.com/skgt.fun/' /etc/nginx/sites-available/skgt-vote

# 활성화 (기본 사이트 비활성화)
sudo ln -s /etc/nginx/sites-available/skgt-vote /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t          # 문법 검사 OK 확인
sudo systemctl reload nginx
```
이제 `http://skgt.fun` 접속 시 화면이 떠야 한다.

## 10. HTTPS (Let's Encrypt / Certbot)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d skgt.fun    # 이메일 입력, 약관 동의, 리다이렉트 'Yes'
```
Certbot 이 Nginx 설정에 443 블록 + 80→443 리다이렉트를 자동 추가한다.
자동 갱신은 `certbot.timer` 로 설정됨 → 확인: `sudo systemctl status certbot.timer`

## 11. 최종 확인
- 사용자: `https://skgt.fun/`
- 관리자: `https://skgt.fun/admin/<ADMIN_SLUG>`  ← 이 URL만 공유하지 않으면 됨
- 두 브라우저로 입장 → 투표 생성/종료 → 실시간 반영 & 발표 오버레이 확인

---

## 12. 포트 3000 없이 접속 (이미 Certbot 적용 완료한 경우)
`https://skgt.fun:3000` 이 아니라 `https://skgt.fun` 으로 접속되게 하려면, Nginx(443)가
받은 요청을 내부 앱(127.0.0.1:3000)으로 프록시하면 된다. 이미 Certbot 을 적용했다면
**443 서버 블록에 `proxy_pass`(+WebSocket 헤더)가 있는지**만 확인/보강하면 된다.

### 1) 현재 skgt.fun 설정이 어느 파일에 있는지 확인
```bash
sudo grep -rl "skgt.fun" /etc/nginx/
sudo nginx -T | grep -A20 "server_name skgt.fun"   # proxy_pass 3000 이 있는지 눈으로 확인
```

### 2) 준비된 최종 설정으로 교체 (가장 확실)
`deploy/nginx-skgt-vote-ssl.conf` 는 skgt.fun 기준 완성본(80→443 리다이렉트 + 443 SSL + 3000 프록시 + WebSocket)이다.
```bash
# 백업
sudo cp -a /etc/nginx/sites-available /root/nginx-sites-bak-$(date +%s) 2>/dev/null || true

# 최종 설정 적용
sudo cp /home/ubuntu/skgt-vote/deploy/nginx-skgt-vote-ssl.conf /etc/nginx/sites-available/skgt-vote
sudo ln -sf /etc/nginx/sites-available/skgt-vote /etc/nginx/sites-enabled/skgt-vote

# skgt.fun 이 default 등 다른 파일에도 정의돼 있으면 충돌 → 비활성화
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```
> `nginx -t` 에서 `ssl_dhparam ... No such file` 이 나오면 conf 에서 `ssl_dhparam` 줄 삭제 후 재시도.
> 인증서 경로가 `skgt.fun` 이 아닌 다른 이름이면(`sudo ls /etc/letsencrypt/live/`) conf 의 경로도 맞춰 수정.

### 3) 방화벽 & 확인
```bash
# Lightsail 콘솔 Networking 에 443, 80 인바운드가 열려 있어야 함 (SSH 22 기본)
curl -I https://skgt.fun/                 # 200
```
- 브라우저에서 `https://skgt.fun` (포트 없이) 접속 → 정상 동작 & 채팅/투표 실시간 확인.
- 앱은 origin 기준으로 소켓을 열므로 `wss://skgt.fun/api/socket` 이 자동 사용됨(코드 수정 불필요).

> 앱 포트를 바꾸고 싶다면(3000 유지 권장): systemd 유닛의 `Environment=PORT=...` 와 conf 의 `proxy_pass` 포트를 함께 바꾸고 각각 재시작/리로드.

---

## 재배포 (코드 수정 후) — 수동
1. 로컬에서 rsync 재실행 (Step 4)
2. 서버에서:
```bash
cd /home/ubuntu/skgt-vote
bash deploy/update.sh     # npm ci → build → systemctl restart
```

---

## 13. GitHub Actions 자동 배포 (CI/CD)
`main` 브랜치에 push 하면 자동 배포된다. **빌드는 GitHub 러너에서** 수행하고(512MB 서버에서 빌드 안 함),
결과물(`.next`)과 소스를 rsync 로 서버에 전송한 뒤 **서버에선 런타임 의존성만 설치하고 재시작**한다.
워크플로우 파일: `.github/workflows/deploy.yml`

### A. 배포용 SSH 키 생성 & 서버 등록 (1회)
로컬(또는 아무 곳)에서 배포 전용 키쌍 생성:
```bash
ssh-keygen -t ed25519 -f skgt-deploy -N "" -C "github-actions-deploy"
# → skgt-deploy(개인키), skgt-deploy.pub(공개키) 생성
```
공개키를 서버의 authorized_keys 에 추가:
```bash
# 서버에서 (또는 ssh-copy-id 사용)
echo "<skgt-deploy.pub 내용>" >> /home/ubuntu/.ssh/authorized_keys
```
> Lightsail 기본 .pem 키를 그대로 써도 되지만, 유출/폐기가 쉬운 **전용 배포 키**를 권장.

### B. 서버: 무중단 재시작용 sudo 허용 (1회)
Actions 가 비대화식 SSH 로 `sudo systemctl restart` 를 실행하려면 암호 없이 되어야 한다.
Lightsail ubuntu 계정은 보통 NOPASSWD sudo 라 그대로 되지만, 암호를 묻는다면:
```bash
echo 'ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart skgt-vote, /bin/systemctl status skgt-vote' | sudo tee /etc/sudoers.d/skgt-deploy
sudo chmod 440 /etc/sudoers.d/skgt-deploy
```

### C. GitHub 저장소 생성 & 최초 push (1회, 로컬 D:\workspace\skgt-vote)
```bash
git init
git add .
git commit -m "chore: 초기 커밋 (실시간 투표/채팅 + 배포 설정)"
git branch -M main
git remote add origin git@github.com:<본인계정>/<저장소>.git   # 또는 https 주소
git push -u origin main
```
> `.gitignore` 가 `node_modules`, `.next`, `.env`, `.claude` 를 제외하므로 **비밀값(ADMIN_SLUG)은 저장소에 올라가지 않는다.** 저장소는 **비공개 권장**.

### D. GitHub Secrets 등록 (1회)
저장소 → Settings → Secrets and variables → Actions → New repository secret
| 이름 | 값 |
|------|-----|
| `LIGHTSAIL_HOST` | `skgt.fun` (또는 고정 IP) |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | `skgt-deploy` 개인키 **파일 내용 전체** (`-----BEGIN ...` 포함) |
| `ADMIN_SLUG` | 관리자 비밀 slug (예: `openssl rand -hex 12` 결과). CI가 서버 `.env` 로 기록 → `/admin/<이 값>` 이 관리자 URL |

### E. 동작 방식 & 주의
- 이후 `git push origin main` → Actions 탭에서 진행 확인. 마지막에 `https://skgt.fun/` 200 이면 성공.
- 수동 실행: Actions 탭 → Deploy to Lightsail → **Run workflow**.
- **systemd 유닛은 CI가 건드리지 않는다** → 서버의 `ADMIN_SLUG` 는 그대로 유지된다.
  (rsync 는 `node_modules`/`.env` 를 제외하고, `/etc/systemd/system/skgt-vote.service` 는 아예 대상이 아님.)
- 배포 중 `systemctl restart` 순간 **진행 중 투표·채팅이 초기화**된다 → 행사 중에는 push/배포 금지.
- 서버 첫 프로비저닝(스왑/Node/Nginx/systemd/Certbot)은 위 Step 1~10 으로 **미리 1회** 되어 있어야 한다. CI는 코드 배포만 담당.

## 운영/트러블슈팅
```bash
# 앱 로그 실시간
sudo journalctl -u skgt-vote -f

# 서비스 상태/재시작
sudo systemctl status skgt-vote
sudo systemctl restart skgt-vote

# Nginx 로그
sudo tail -f /var/log/nginx/error.log

# 메모리 확인
free -h
```

### 자주 겪는 이슈
- **빌드가 `Killed`**: 스왑 미설정. Step 2 수행 후 재빌드.
- **502 Bad Gateway**: Node 서비스가 죽음. `journalctl -u skgt-vote -f` 로 원인 확인, `.env`/ADMIN_SLUG 확인.
- **WebSocket 연결 안 됨(폴링만 됨)**: Nginx 의 `Upgrade`/`Connection` 헤더 설정 누락. `deploy/nginx-skgt-vote.conf` 그대로 적용됐는지 확인.
- **관리자 페이지 404**: `/admin/<slug>` 의 slug 가 systemd 의 `ADMIN_SLUG` 와 불일치. 서비스 재시작 필요.
- **CI 배포 중 `Unit skgt-vote.service not found`**: 서버에 systemd 유닛이 아직 설치되지 않음(CI는 유닛을 건드리지 않음). Step 6 을 서버에서 1회 실행(`sudo cp deploy/skgt-vote.service ...` → ADMIN_SLUG 설정 → `daemon-reload`/`enable`/`start`) 후 워크플로우 재실행.

## 알아둘 특성 (설계상)
- 상태는 **서버 메모리**에만 존재 → 서비스 재시작/재배포 시 진행 중 투표·채팅 **초기화**. 행사 중에는 재시작을 피할 것.
- 단일 프로세스(단일 서버) 전제. 스케일아웃(다중 인스턴스)은 현재 미지원(공유 저장소 필요).
