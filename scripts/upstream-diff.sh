#!/usr/bin/env bash
#
# upstream-diff.sh
#
# Reports commits on every vendored upstream repo since our pinned SHA.
# Useful for deciding whether to bump a submodule pin and to audit
# security-relevant changes upstream.
#
# Covers: the seven submodules under vendor/ plus the OpenWork hard-fork
# point recorded in UPSTREAM.md.
#
# Usage:
#   ./scripts/upstream-diff.sh                # summary for all
#   ./scripts/upstream-diff.sh --full         # full commit list per repo
#   ./scripts/upstream-diff.sh vendor/mempalace   # one submodule

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

FULL=0
targets=()
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    *)      targets+=("$arg") ;;
  esac
done

if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(
    vendor/cocoindex-code
    vendor/mempalace
    vendor/graphify
    vendor/context-mode
    vendor/deer-flow
    vendor/autoresearch
    vendor/agency-agents
  )
fi

report_submodule() {
  local dir="$1"
  if [[ ! -d "${ROOT}/${dir}" ]]; then
    printf "  \033[33mSKIP\033[0m  %s (not initialized)\n" "${dir}"
    return 0
  fi
  pushd "${ROOT}/${dir}" >/dev/null
  local pinned
  pinned="$(git rev-parse HEAD)"
  local remote_default
  remote_default="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo main)"
  git fetch --quiet origin "${remote_default}" 2>/dev/null || true
  local latest
  latest="$(git rev-parse "origin/${remote_default}" 2>/dev/null || echo "${pinned}")"
  local count
  count="$(git rev-list --count "${pinned}..${latest}" 2>/dev/null || echo 0)"
  printf "  %-30s pinned=%s  branch=%s  ahead=%s\n" "${dir}" "${pinned:0:10}" "${remote_default}" "${count}"
  if [[ $FULL -eq 1 && "${count}" != "0" ]]; then
    git log --oneline --no-decorate "${pinned}..${latest}" | sed 's/^/      /'
  fi
  popd >/dev/null
}

echo "==> Vendor drift report"
for t in "${targets[@]}"; do
  report_submodule "${t}"
done

# OpenWork hard-fork point (not a submodule; tracked via UPSTREAM.md).
echo ""
echo "==> OpenWork fork point (hard fork; see UPSTREAM.md)"
OPENWORK_PIN="$(grep -oE '[0-9a-f]{40}' "${ROOT}/UPSTREAM.md" | head -1)"
echo "  UPSTREAM.md pin: ${OPENWORK_PIN:-missing}"
echo "  Compare: https://github.com/jaycdave88/openwork/compare/${OPENWORK_PIN}...dev"
