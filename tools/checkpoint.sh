#!/bin/sh
# Checkpoint after each batch: rebuild the hub, QA + thumbnail the given demos, refresh the hero sprite,
# rebuild again, then save a git commit and a tar.gz archive in backups/.
#   sh tools/checkpoint.sh "059,077,095" "Batch 1: finished 059 077 095"
set -e
cd "$(dirname "$0")/.."
IDS="$1"; MSG="${2:-Checkpoint}"
python3 tools/build.py > /dev/null
if [ -n "$IDS" ]; then
  node tools/qa.mjs --ids "$IDS" --out evidence/qa --concurrency 1 | tail -n 25 || true
  node tools/qa.mjs --ids "$IDS" --thumbs --no-shots --out evidence/qa --concurrency 1 > /dev/null || true
fi
node tools/qa.mjs --sprite --no-shots --out evidence/qa > /dev/null || true
python3 tools/build.py | head -c 400; echo
git add -A
git commit -q -m "$MSG

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" && git log --oneline -1
mkdir -p backups
TS=$(date +%Y%m%d-%H%M)
tar --exclude=./.git --exclude=./backups --exclude=./evidence/qa-agents --exclude='./evidence/qa/*.jpg' -czf "backups/showcase-$TS.tar.gz" .
ls -1 backups | tail -n 3
