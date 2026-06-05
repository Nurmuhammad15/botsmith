#!/usr/bin/env python
"""
Script to clean up corrupted database and reset migrations
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'botsmith.settings')
django.setup()

from django.db import connection

tables_to_drop = [
    'django_content_type',
    'django_session',
    'django_migrations',
    'auth_permission',
    'auth_group',
    'auth_user',
    'auth_group_permissions',
    'auth_user_groups',
    'auth_user_user_permissions',
    'django_admin_log',
    'orders_botorder',
    'orders_botdelivery',
    'orders_clientprofile',
]

with connection.cursor() as cursor:
    for table in tables_to_drop:
        try:
            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')
            print(f'✓ Dropped {table}')
        except Exception as e:
            print(f'✗ Failed to drop {table}: {e}')

print('\n✓ Database cleaned successfully!')
