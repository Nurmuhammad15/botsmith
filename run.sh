#!/bin/bash
echo "==================================="
echo "  BotSmith — Django App"
echo "==================================="
echo ""
pip install -r requirements.txt --quiet
python manage.py migrate --run-syncdb
python manage.py runserver 0.0.0.0:8000
