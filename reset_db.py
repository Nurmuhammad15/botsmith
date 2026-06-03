"""
Запусти: python reset_db.py
Удаляет всех клиентов и заказы. Админ Nurmuhammad остаётся.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'botsmith.settings')
django.setup()

from django.contrib.auth.models import User
from orders.models import BotOrder

# Delete all orders
deleted_orders = BotOrder.objects.all().delete()
print(f"Удалено заказов: {deleted_orders[0]}")

# Delete all non-staff users
deleted_users = User.objects.filter(is_staff=False).delete()
print(f"Удалено клиентов: {deleted_users[0]}")

# Make sure Nurmuhammad exists with correct password
u, created = User.objects.get_or_create(username='Nurmuhammad')
u.is_staff = True
u.is_superuser = True
u.set_password('admin123')
u.save()
print(f"Админ Nurmuhammad {'создан' if created else 'обновлён'} — пароль: admin123")

print("\nГотово! База обнулена.")
