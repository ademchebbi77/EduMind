#!/usr/bin/env bash
# Render build script for Django backend
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# Optional demo course catalogue. It needs a teacher account: sign up as a teacher,
# then redeploy. Skipped (without failing the deploy) when there is none yet.
if [ "${SEED_COURSES:-0}" = "1" ]; then
  python manage.py seed_courses || echo "seed_courses skipped: create a teacher account, then redeploy."
fi
