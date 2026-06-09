from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('orders', '0005_botdelivery_name_description')]
    operations = [
        migrations.AddField(
            model_name='botorder',
            name='price_confirmed',
            field=models.BooleanField(default=False),
        ),
    ]
