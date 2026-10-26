#!/bin/sh
# Prepares the database and static files, then starts the given command.
set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput --verbosity 0
  # Demo accounts (known password): local stack and CI only, never a real deployment.
  # seed_demo refuses to run without DEBUG, so DEBUG is enabled for this command only.
  if [ "${SEED_DEMO:-0}" = "1" ]; then
    DEBUG=True python manage.py seed_demo
  fi
fi

exec "$@"
