from django.db import models
from django.contrib.auth.models import User

class BotOrder(models.Model):
    STATUS_CHOICES = [
        (1, 'Заказ подтверждён'),
        (2, 'Бот настроен'),
        (3, 'Деплой на сервер'),
        (4, 'QA тестирование'),
        (5, 'Готово'),
    ]
    PAYMENT_STATUS = [
        ('pending',  'Ожидает оплаты'),
        ('paid',     'Оплачен'),
        ('failed',   'Ошибка оплаты'),
        ('refunded', 'Возврат'),
    ]
    PAYMENT_METHOD = [
        ('payme', 'Payme'),
        ('click', 'Click'),
        ('manual', 'Вручную'),
        ('', '—'),
    ]
    user            = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    order_id        = models.CharField(max_length=12, unique=True)
    bot_type        = models.CharField(max_length=100)
    price           = models.DecimalField(max_digits=10, decimal_places=2)
    status          = models.IntegerField(choices=STATUS_CHOICES, default=1)
    payment_status  = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='pending')
    payment_method  = models.CharField(max_length=20, choices=PAYMENT_METHOD, default='')
    payment_id      = models.CharField(max_length=100, blank=True)   # external tx id
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)
    notes           = models.TextField(blank=True)

    def __str__(self):
        return f'#{self.order_id} — {self.user.username} — {self.get_status_display()}'

    class Meta:
        ordering = ['-created_at']

class BotDelivery(models.Model):
    """Bot credentials delivered to client after completion"""
    order       = models.OneToOneField(BotOrder, on_delete=models.CASCADE, related_name='delivery')
    bot_name    = models.CharField(max_length=200, blank=True, default='')  # display name
    bot_token   = models.CharField(max_length=200)
    bot_username = models.CharField(max_length=100)   # @username
    bot_url     = models.CharField(max_length=300, blank=True)  # t.me/username
    bot_description = models.TextField(blank=True, default='')  # description for client
    admin_note  = models.TextField(blank=True)
    delivered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Delivery for #{self.order.order_id}'


class ClientProfile(models.Model):
    """Stores plain password set by admin for display purposes"""
    user           = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    plain_password = models.CharField(max_length=200, blank=True, default='')

    def __str__(self):
        return f'Profile of {self.user.username}'
