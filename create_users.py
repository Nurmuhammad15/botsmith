import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'botsmith.settings')
django.setup()

from django.contrib.auth.models import User
from orders.models import BotOrder

# Create admin user
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@botsmith.local', 'admin123')
    print('✓ Admin user created')
else:
    print('✓ Admin user already exists')

# Create client user
if not User.objects.filter(username='client1').exists():
    user = User.objects.create_user('client1', 'client1@botsmith.local', 'pass123')
    print('✓ Client user created')
else:
    user = User.objects.get(username='client1')
    print('✓ Client user already exists')

# Create demo orders for testing
orders_count = BotOrder.objects.filter(user=user).count()
if orders_count == 0:
    BotOrder.objects.create(
        user=user,
        order_id='DEMO0001',
        bot_type='Telegram Bot',
        price=49.00,
        status=1,
        notes='Demo order for testing'
    )
    BotOrder.objects.create(
        user=user,
        order_id='DEMO0002',
        bot_type='Telegram Bot',
        price=99.00,
        status=3,
        notes='Another demo order'
    )
    print('✓ Demo orders created')
else:
    print(f'✓ {orders_count} demo orders already exist')
