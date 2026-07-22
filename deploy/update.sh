#!/usr/bin/env bash
# 재배포 스크립트 — 새 코드가 서버에 반영된 뒤 실행 (서버에서 실행)
# 사용법:  bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # 프로젝트 루트로 이동

echo "▶ 의존성 설치 (전체: 빌드에 tailwind/postcss 등 devDeps 필요)"
npm ci

echo "▶ 프로덕션 빌드 (스왑 활성 상태에서 실행 권장)"
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "▶ 서비스 재시작"
sudo systemctl restart skgt-vote

echo "▶ 상태 확인"
sudo systemctl status skgt-vote --no-pager -l | head -15

echo "✅ 재배포 완료"
