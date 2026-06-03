import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'botsmith.settings')

django.setup()

# Auto-migrate on cold start
from django.core.management import call_command
try:
    call_command('migrate', '--noinput', verbosity=0)
except Exception as e:
    print(f"Migration warning: {e}")

from botsmith.wsgi import application
