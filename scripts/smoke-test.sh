#!/usr/bin/env bash
# Smoke test of the running Docker stack, done the way a user would use it:
# web page, API, static files, login with a demo account and one real feature.
#
#   ./scripts/smoke-test.sh [http://localhost:8080]
set -euo pipefail

BASE="${1:-http://localhost:8080}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

expect_status() { # url expected-status label
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$1")
  [ "$code" = "$2" ] && pass "$3 ($code)" || fail "$3: expected $2, got $code"
}

csrf_token() { awk '$6 == "csrftoken" { print $7 }' "$JAR" | tail -n 1; }

post_json() { # path json -> prints body, fails on HTTP error
  # The body goes through stdin so accented text stays UTF-8 on every OS.
  printf '%s' "$2" | curl -fsS -c "$JAR" -b "$JAR" \
    -H "Content-Type: application/json" -H "X-CSRFToken: $(csrf_token)" \
    -H "Origin: $BASE" -H "Referer: $BASE/" \
    --data-binary @- "$BASE$1"
}

curl -fsS "$BASE/" | grep -q '<div id="root">' && pass "React app served by Nginx" || fail "React app"
expect_status "$BASE/announcements/new" 200 "Single-page app route"
expect_status "$BASE/api/config/" 200 "API reachable through the proxy"
expect_status "$BASE/api/auth/me/" 401 "API requires authentication"
expect_status "$BASE/static/admin/css/base.css" 200 "Django static files"
expect_status "$BASE/admin/login/" 200 "Django admin"

curl -fsS -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf/" >/dev/null
[ -n "$(csrf_token)" ] && pass "CSRF cookie" || fail "CSRF cookie"

post_json /api/auth/login/ '{"email":"teacher@edumind.local","password":"EduMind!2026"}' \
  | grep -q '"teacher@edumind.local"' && pass "Login with the demo teacher" || fail "Login"
curl -fsS -b "$JAR" "$BASE/api/auth/me/" | grep -q '"role":"teacher"' && pass "Session cookie works" || fail "Session"

post_json /api/announcements/extract/ \
  '{"text":"Atelier Python\nRéservé aux étudiants le 12 novembre 2026 à 14h30. Lien : https://meet.google.com/abc-defg-hij"}' \
  | grep -q 'meet.google.com' && pass "Feature: announcement text extraction" || fail "Announcement extraction"

curl -fsS -b "$JAR" "$BASE/api/courses/" | grep -q '"results"' && pass "Feature: course catalogue (database)" || fail "Courses"

echo "All smoke tests passed."
