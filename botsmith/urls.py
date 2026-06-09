from django.contrib import admin
from django.urls import path
from django.http import HttpResponse
from orders import views

urlpatterns = [
    path('googlefce41dd76233285b.html', lambda r: HttpResponse('google-site-verification: googlefce41dd76233285b.html', content_type='text/html; charset=utf-8')),
    path('django-admin/', admin.site.urls),
    path('',                         views.home,               name='home'),
    path('orders/',                  views.my_orders,          name='my_orders'),
    path('login/',                   views.login_view,         name='login'),
    path('admin-login/',             views.admin_login_view,   name='admin_login'),
    path('register/',                views.register_view,      name='register'),
    path('logout/',                  views.logout_view,        name='logout'),
    path('orders/place/',            views.place_order,        name='place_order'),
    path('orders/<str:order_id>/',   views.order_detail,       name='order_detail'),
    # Payment pages
    path('payment/payme/<str:order_id>/',  views.pay_payme,       name='pay_payme'),
    path('payment/click/<str:order_id>/',  views.pay_click,       name='pay_click'),
    path('payment/success/',               views.payment_success, name='payment_success'),
    # Payment callbacks
    path('payment/payme/callback/',  views.payme_callback,    name='payme_callback'),
    path('payment/click/callback/',  views.click_callback,    name='click_callback'),
    # Admin
    path('admin-panel/',                         views.admin_panel,         name='admin_panel'),
    path('admin-panel/client/<int:user_id>/',    views.admin_client_detail, name='admin_client_detail'),
    # API
    path('api/advance/<str:order_id>/',          views.advance_step,            name='advance_step'),
    path('api/set-step/<str:order_id>/',         views.set_step,                name='set_step'),
    path('api/mark-paid/<str:order_id>/',        views.mark_paid,               name='mark_paid'),
    path('api/set-price/<str:order_id>/',        views.set_price,               name='set_price'),
    path('api/confirm-price/<str:order_id>/',     views.confirm_price,           name='confirm_price'),
    path('api/deliver/<str:order_id>/',          views.deliver_bot,             name='deliver_bot'),
    path('api/status/<str:order_id>/',           views.order_status_api,        name='order_status_api'),
    path('api/change-password/<int:user_id>/',   views.change_client_password,  name='change_client_password'),
]
