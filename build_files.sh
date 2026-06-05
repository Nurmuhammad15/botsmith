#!/bin/bash

echo "=== Installing dependencies ==="
pip install -r requirements.txt

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput 2>/dev/null || echo "collectstatic skipped"

echo "=== Running migrations ==="
python manage.py migrate --noinput

echo "=== Creating admin user ==="
python manage.py shell -c "
from django.contrib.auth.models import User
try:
    if not User.objects.filter(username='admin').exists():
        User.objects.create_superuser('admin', '', 'admin123')
        print('Admin created')
    else:
        print('Admin already exists')
except Exception as e:
    print('Admin creation skipped:', e)
" 2>/dev/null || echo "admin creation skipped"

echo "=== Build complete ==="
