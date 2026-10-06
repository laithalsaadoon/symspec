#!/usr/bin/env bash
# Rebuild the stored fixture documents with the symspec build in this clone.
# Run from the repository root AFTER `pnpm build`, at base 0fca043 (feat/controlled-vocabulary),
# so every stored document is one a pre-S3 `apply` really wrote. Never run it on the S3 build:
# the stored documents are the LEGACY channel and must stay what base accepted.
set -euo pipefail
F=.erpaval/vdd/s3-waivability/fixture
CLI=dist/cli.mjs
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fresh() { rm -f "$1"; node "$CLI" init "$1" >/dev/null; node "$CLI" apply --file "$1" --ops "$F/base.ops.jsonl" >/dev/null; }
# Timestamps are pinned so a rebuild is byte-stable; the content hash reads no timestamp.
pin() { node -e '
  const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p));
  for(const r of Object.values(d.requirements)){r.createdAt="2026-10-05T00:00:00.000Z";r.updatedAt="2026-10-05T00:00:00.000Z"}
  fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' "$1"; }
fresh "$F/base.json"; pin "$F/base.json"
cp "$F/base.json" "$F/legacy-mixed.json"
node "$CLI" apply --file "$F/legacy-mixed.json" --ops "$F/legacy-mixed.ops.jsonl" >/dev/null; pin "$F/legacy-mixed.json"
for s in "$F"/cases/*.ops.jsonl; do
  n=$(basename "$s" .ops.jsonl); out="$F/cases/$n.stored.json"
  cp "$F/base.json" "$tmp/doc.json"
  if node "$CLI" apply --file "$tmp/doc.json" --ops "$s" > "$tmp/apply.json"; then
    pin "$tmp/doc.json"; cp "$tmp/doc.json" "$out"; echo "$n: stored"
  else
    rm -f "$out"; echo "$n: refused by base apply ($(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));const r=(j.data?.results??[]).find(x=>!x.ok);console.log(r?.code??j.code)' "$tmp/apply.json"))"
  fi
done
# The hand-edit channel: documents no `apply` writes, made by editing JSON (trust boundary R4).
hand() { node -e '
  const fs=require("fs");const [src,dst,w]=process.argv.slice(1);const d=JSON.parse(fs.readFileSync(src));
  d.waivers=[...d.waivers,JSON.parse(w)];fs.writeFileSync(dst,JSON.stringify(d,null,2)+"\n")' "$F/base.json" "$F/cases/$1.json" "$2"; }
LOG1=5a1e0000-0000-4000-8000-0000000000a1
H_LOG1=sha256:fd8b2c50a779708a19c161d83262563c7d8826c3f749072ab3eaf58b2c286ae0
hand hand-refs-no-hash "{\"code\":\"GTWR_R5_INDEFINITE_ARTICLE\",\"requirementIds\":[\"$LOG1\"],\"reason\":\"hand-written, no hash\"}"
hand hand-ref-with-hash "{\"code\":\"GTWR_R5_INDEFINITE_ARTICLE\",\"requirementId\":\"$LOG1\",\"contentHash\":\"$H_LOG1\",\"reason\":\"hand-written, single ref bound to a hash\"}"
hand hand-never-code-only "{\"code\":\"FND_OPPOSITION_CANDIDATE\",\"reason\":\"hand-written document-wide triage waiver\"}"
hand hand-unknown-code "{\"code\":\"FND_NOT_A_CODE\",\"reason\":\"hand-written waiver of a code no catalog publishes\"}"
echo "built under $F"
