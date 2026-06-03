from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

class Migration(migrations.Migration):
    dependencies = [('orders', '0002_payment_fields')]
    operations = [
        migrations.CreateModel(
            name='BotDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('bot_token', models.CharField(max_length=200)),
                ('bot_username', models.CharField(max_length=100)),
                ('bot_url', models.CharField(blank=True, max_length=300)),
                ('admin_note', models.TextField(blank=True)),
                ('delivered_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='delivery', to='orders.botorder')),
            ],
        ),
    ]
