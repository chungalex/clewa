#!/bin/bash
# Nightly full-data backup for Clewa (free tier has no PITR).
# Token lives in ~/.clewa-backup-token (never in this repo).
set -e
TOKEN=$(cat ~/.clewa-backup-token)
OUT=~/clewa-backups/backup-$(date +%Y-%m-%d).json
TABLES="profiles orders record_lines order_invites order_messages samples sample_photos qc_checks quotes order_documents production_reports products components boms factories styles style_sections style_images style_versions generation_jobs planning_items season_budgets sourcing_requests waitlist"
echo "{" > "$OUT"
FIRST=1
for T in $TABLES; do
  [ $FIRST -eq 0 ] && echo "," >> "$OUT"
  FIRST=0
  printf '"%s": ' "$T" >> "$OUT"
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://api.supabase.com/v1/projects/cxchrwccojvurqcxakyw/database/query" \
    -d "{\"query\":\"select coalesce(json_agg(t), '[]'::json) from public.$T t;\"}" \
    | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)[0]['coalesce']))" >> "$OUT"
done
echo "}" >> "$OUT"
# keep 14 days
ls -t ~/clewa-backups/backup-*.json 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true
echo "backup written: $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
