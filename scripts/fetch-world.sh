#!/usr/bin/env sh
# Author: Prateek Dhall — World Dataset Assignment.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
URL="https://downloads.mysql.com/docs/world-db.zip"
TMP="$ROOT/.world-db.zip"
OUT="$ROOT/mysql-init/00-world.sql"
if [ -f "$OUT" ]; then
  echo "world.sql already present: $OUT"
  exit 0
fi
echo "Downloading official MySQL world sample database..."
if command -v curl >/dev/null 2>&1; then curl -fL "$URL" -o "$TMP"; else wget -O "$TMP" "$URL"; fi
python3 - "$TMP" "$OUT" <<'PY'
import sys, zipfile
zpath, out = sys.argv[1:]
with zipfile.ZipFile(zpath) as z:
    names=[n for n in z.namelist() if n.endswith('world.sql')]
    if not names: raise SystemExit('world.sql not found in archive')
    open(out,'wb').write(z.read(names[0]))
PY
rm -f "$TMP"
echo "Installed official world.sql -> $OUT"
