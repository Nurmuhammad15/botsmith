# BotSmith — Django Order Tracker

## Быстрый старт

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Откройте: http://127.0.0.1:8000

## Демо аккаунты
| Роль   | Логин   | Пароль   |
|--------|---------|----------|
| Admin  | admin   | admin123 |
| Client | client1 | pass123  |
| Client | client2 | pass123  |
| Client | client3 | pass123  |

## Структура страниц

| URL | Описание |
|-----|----------|
| `/login/` | Вход |
| `/` | Клиент — список заказов |
| `/orders/<id>/` | Клиент — детали заказа + live статус |
| `/admin-panel/` | Админ — все заказы + клиенты |
| `/admin-panel/client/<id>/` | Админ — заказы конкретного клиента |

## Как работает синхронизация

- Админ нажимает **"Подтвердить шаг →"** или меняет шаг через dropdown
- API (`/api/advance/` или `/api/set-step/`) обновляет `BotOrder.status` в БД
- Клиент на странице заказа каждые **8 секунд** делает polling на `/api/status/<id>/`
- При изменении статуса UI клиента автоматически обновляется (кружки, цвета, текст)

## Файлы
```
botsmith/
├── botsmith/          # Django project settings & URLs
├── orders/
│   ├── models.py      # BotOrder model
│   ├── views.py       # All views + API
│   └── templates/orders/
│       ├── login.html            # Страница входа
│       ├── client.html           # Клиент: список заказов
│       ├── order_detail.html     # Клиент: детали + трекер
│       ├── admin_panel.html      # Админ: панель
│       └── admin_client_detail.html  # Админ: заказы клиента
├── requirements.txt
└── run.sh
```
