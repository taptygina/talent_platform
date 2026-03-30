#!/bin/sh
set -e

echo "Applying migrations..."
python manage.py migrate --noinput

echo "Starting Django..."
python manage.py runserver 0.0.0.0:8000
