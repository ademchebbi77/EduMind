#!/usr/bin/env bash
# Analyses EduMind with the SonarQube server from docker-compose.sonarqube.yml and
# fails when the quality gate fails. Used by the CI pipeline and for local demos.
#
#   docker compose -f docker-compose.sonarqube.yml up -d
#   ./scripts/sonarqube-scan.sh
#
# Optional: SONAR_ADMIN_PASSWORD (if you changed "admin" in the UI), SONAR_URL.
# Coverage is included when Backend/coverage.xml and Frontend/coverage/lcov.info exist.
set -euo pipefail

SONAR_URL="${SONAR_URL:-http://localhost:9000}"
ADMIN="admin:${SONAR_ADMIN_PASSWORD:-admin}"
NETWORK="${SONAR_NETWORK:-edumind-sonarqube_default}"
SCANNER_IMAGE="sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0"
GATE="EduMind"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

api() { curl -fsS -u "$ADMIN" "$@"; }
json_value() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo "Waiting for SonarQube at $SONAR_URL ..."
status=""
for _ in $(seq 1 120); do
  status=$(curl -s "$SONAR_URL/api/system/status" | json_value status || true)
  [ "$status" = "UP" ] && break
  sleep 5
done
[ "$status" = "UP" ] || { echo "SonarQube is not up (status: ${status:-none})."; exit 1; }

# Quality gate on the whole code base (each CI run starts a fresh server, so the
# default "new code" gate would have nothing to compare to).
# The gate is recreated on every run so it always matches this script.
# Ratings: 1 = A ... 5 = E.
if api "$SONAR_URL/api/qualitygates/show?name=$GATE" >/dev/null 2>&1; then
  api -X POST "$SONAR_URL/api/qualitygates/set_as_default" -d "name=Sonar way" >/dev/null
  api -X POST "$SONAR_URL/api/qualitygates/destroy" -d "name=$GATE" >/dev/null
fi
api -X POST "$SONAR_URL/api/qualitygates/create" -d "name=$GATE" >/dev/null
while read -r metric op error; do
  api -X POST "$SONAR_URL/api/qualitygates/create_condition" \
    -d "gateName=$GATE" -d "metric=$metric" -d "op=$op" -d "error=$error" >/dev/null
done <<'CONDITIONS'
software_quality_security_rating GT 1
software_quality_maintainability_rating GT 1
software_quality_reliability_rating GT 3
coverage LT 70
duplicated_lines_density GT 5
CONDITIONS
api -X POST "$SONAR_URL/api/qualitygates/set_as_default" -d "name=$GATE" >/dev/null

TOKEN=$(api -X POST "$SONAR_URL/api/user_tokens/generate" \
  -d "name=scan-$(date +%s)-$RANDOM" -d "type=GLOBAL_ANALYSIS_TOKEN" | json_value token)
[ -n "$TOKEN" ] || { echo "Could not create an analysis token."; exit 1; }

# Coverage reports point to the paths of the machine that produced them; the scanner
# container sees the repository at /usr/src.
if [ -f "$ROOT/Backend/coverage.xml" ]; then
  # One single source: file names in the report are relative to Backend/.
  sed -i.bak -E -e '/<source>.*<\/source>/d' -e 's#<sources>#<sources><source>/usr/src/Backend</source>#' \
    "$ROOT/Backend/coverage.xml"
  rm -f "$ROOT/Backend/coverage.xml.bak"
fi
if [ -f "$ROOT/Frontend/coverage/lcov.info" ]; then
  sed -i.bak -E 's#^SF:(.*[/\\])?src[/\\]#SF:Frontend/src/#; /^SF:/ s#\\#/#g' "$ROOT/Frontend/coverage/lcov.info"
  rm -f "$ROOT/Frontend/coverage/lcov.info.bak"
fi

MOUNT="$ROOT"
if command -v cygpath >/dev/null 2>&1; then  # Git Bash on Windows
  MOUNT="$(cygpath -w "$ROOT")"
  export MSYS_NO_PATHCONV=1
fi

docker run --rm --network "$NETWORK" -v "$MOUNT:/usr/src" \
  -e SONAR_HOST_URL="http://sonarqube:9000" -e SONAR_TOKEN="$TOKEN" \
  "$SCANNER_IMAGE" -Dsonar.qualitygate.wait=true -Dsonar.qualitygate.timeout=600 \
  && result=0 || result=$?

echo
gate_status=$(curl -s -u "$TOKEN:" "$SONAR_URL/api/qualitygates/project_status?projectKey=edumind" \
  | grep -o '"projectStatus":{"status":"[A-Z]*"' | sed 's/.*"\([A-Z]*\)"$/\1/')
echo "Quality gate: ${gate_status:-unknown}"
curl -s -u "$TOKEN:" "$SONAR_URL/api/measures/component?component=edumind&metricKeys=software_quality_security_rating,software_quality_reliability_rating,software_quality_maintainability_rating,coverage,duplicated_lines_density,security_hotspots,ncloc" \
  | grep -o '"metric":"[a-z_]*","value":"[^"]*"' | sed -E 's/"metric":"([a-z_]*)","value":"([^"]*)"/  \1: \2/'
echo "Dashboard: $SONAR_URL/dashboard?id=edumind"
exit "$result"
