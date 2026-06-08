from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('orders', '0004_clientprofile')]
    operations = [
        migrations.AddField(
            model_name='botdelivery',
            name='bot_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='botdelivery',
            name='bot_description',
            field=models.TextField(blank=True, default=''),
        ),
    ]
