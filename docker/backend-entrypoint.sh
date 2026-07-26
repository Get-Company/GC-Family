#!/bin/sh
set -e

# Auf die Datenbank warten (falls DB_HOST gesetzt ist).
if [ -n "$DB_HOST" ]; then
  echo "Warte auf Datenbank $DB_HOST:${DB_PORT:-5432} ..."
  until python -c "import socket,sys; s=socket.socket(); s.settimeout(2); \
    sys.exit(0) if s.connect_ex((\"$DB_HOST\", int(\"${DB_PORT:-5432}\")))==0 else sys.exit(1)" 2>/dev/null; do
    sleep 1
  done
fi

echo "Führe Migrationen aus ..."
python manage.py migrate --noinput

echo "Sammle statische Dateien ..."
python manage.py collectstatic --noinput

exec "$@"
