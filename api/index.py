import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'botsmith.settings')

import django
django.setup()

# Run migrations on cold start
try:
    from django.core.management import call_command
    call_command('migrate', '--noinput', verbosity=0)
except Exception as e:
    print(f"Migration skipped: {e}")

# Create admin if not exists
try:
    from django.contrib.auth.models import User
    if not User.objects.filter(username='admin').exists():
        User.objects.create_superuser('admin', '', 'admin123')
except Exception:
    pass

# Ensure CSRF cookie is set correctly for Vercel
import django.middleware.csrf as csrf_module

from botsmith.wsgi import application

# Wrap application to fix CSRF on Vercel
original_app = application

def fixed_application(environ, start_response):
    # Ensure X-Forwarded-Proto is handled
    if environ.get('HTTP_X_FORWARDED_PROTO') == 'https':
        environ['wsgi.url_scheme'] = 'https'
    return original_app(environ, start_response)

application = fixed_application
