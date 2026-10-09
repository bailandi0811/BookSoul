#!/usr/bin/env bash
set -euo pipefail

script_path="$(readlink -f "${BASH_SOURCE[0]}")"
script_dir="$(dirname "$script_path")"
lock_file="${BOOKSOUL_LOCK_FILE:-/var/lock/booksoul-deploy.lock}"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another BookSoul deployment is already running." >&2
  exit 1
fi

exec node "$script_dir/booksoul-deploy.mjs" "$@"
