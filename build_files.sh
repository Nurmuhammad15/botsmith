#!/bin/bash
set -e

echo "=== Installing dependencies ==="
pip install -r requirements.txt

echo "=== Running migrations ==="
python manage.py migrate --noinput

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput --clear

echo "=== Creating admin user ==="
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', '', 'admin123')
    print('Admin created')
else:
    print('Admin already exists')
"

echo "=== Build complete ==="
