from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('orders', '0001_initial')]
    operations = [
        migrations.AddField('BotOrder','payment_status',models.CharField(choices=[('pending','Ожидает оплаты'),('paid','Оплачен'),('failed','Ошибка'),('refunded','Возврат')],default='pending',max_length=20)),
        migrations.AddField('BotOrder','payment_method',models.CharField(blank=True,choices=[('payme','Payme'),('click','Click'),('manual','Вручную'),('','—')],default='',max_length=20)),
        migrations.AddField('BotOrder','payment_id',models.CharField(blank=True,max_length=100)),
    ]
