#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  # Hand any root-owned files in the bind-mounted data dir to the unprivileged user (Unraid nobody:users), then drop privileges.
  find /app/data ! -user 99 -exec chown 99:100 {} + 2>/dev/null || true
  if ! gosu 99:100 sh -c 'f=/app/data/.write-test.$$; : > "$f" && rm -f "$f"' 2>/dev/null; then
    echo "[entrypoint] WARNING: /app/data is not writable by uid 99 (gid 100). Fix the host folder permissions (Unraid: Tools > Docker Safe New Perms)." >&2
  fi
  exec gosu 99:100 "$@"
fi

exec "$@"
