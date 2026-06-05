from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Sum, Count, Q
from .models import BotOrder, BotDelivery
import json, random, string, hashlib, base64

def is_admin(u): return u.is_staff

def gen_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

# ─────────────── PAGES ───────────────
def home(request):
    return render(request, 'orders/home.html')

# ── HARDCODED ADMIN CREDENTIALS ──
# Чтобы добавить нового админа — добавь сюда логин и пароль
ADMIN_ACCOUNTS = {
    'admin': 'admin123',
    # 'другой_админ': 'его_пароль',
}

def login_view(request):
    error = ''
    if request.method == 'POST':
        username = request.POST.get('username', '')
        password = request.POST.get('password', '')

        # Check hardcoded admin accounts first
        if username in ADMIN_ACCOUNTS and ADMIN_ACCOUNTS[username] == password:
            u, created = User.objects.get_or_create(username=username)
            if created or not u.is_staff:
                u.is_staff = True
                u.is_superuser = True
                u.set_password(password)
                u.save()
            u = authenticate(request, username=username, password=password)
            if u:
                login(request, u)
                return redirect('admin_panel')

        # Regular user login
        u = authenticate(request, username=username, password=password)
        if u and u.is_active:
            login(request, u)
            if u.is_staff:
                return redirect('admin_panel')
            return redirect('my_orders')
        else:
            error = 'Неверный логин или пароль'
    return render(request, 'orders/login.html', {'error': error})


def admin_login_view(request):
    error = ''
    if request.method == 'POST':
        username = request.POST.get('username', '')
        password = request.POST.get('password', '')

        # Check hardcoded admin accounts
        if username in ADMIN_ACCOUNTS and ADMIN_ACCOUNTS[username] == password:
            u, created = User.objects.get_or_create(username=username)
            if created or not u.is_staff:
                u.is_staff = True
                u.is_superuser = True
                u.set_password(password)
                u.save()
            u = authenticate(request, username=username, password=password)
            if u:
                login(request, u)
                return redirect('admin_panel')
        error = 'Неверный логин или пароль'
    return render(request, 'orders/admin_login.html', {'error': error})

def register_view(request):
    if request.method == 'GET':
        return render(request, 'orders/login.html', {'open_register': True})
    username = request.POST.get('username','').strip()
    email    = request.POST.get('email','').strip()
    password = request.POST.get('password','')
    error = ''
    if len(username) < 3:   error = 'Логин должен быть не менее 3 символов'
    elif len(password) < 6: error = 'Пароль должен быть не менее 6 символов'
    elif User.objects.filter(username=username).exists(): error = 'Такой логин уже занят'
    if error:
        return render(request, 'orders/login.html', {'error': error, 'open_register': True})
    user = User.objects.create_user(username=username, email=email, password=password)
    login(request, user)
    return redirect('my_orders')

def logout_view(request):
    logout(request)
    return redirect('home')

# ─────────────── CLIENT ───────────────
@login_required(login_url='login')
def my_orders(request):
    orders = BotOrder.objects.filter(user=request.user).prefetch_related('delivery')
    return render(request, 'orders/client.html', {'orders': orders, 'user': request.user})

@login_required(login_url='login')
def place_order(request):
    if request.method == 'POST':
        # Support both form POST and JSON
        if request.content_type and 'application/json' in request.content_type:
            import json as _json
            data = _json.loads(request.body)
            bot_type = data.get('bot_type', 'Telegram Bot')
            price    = data.get('price', 0)
            method   = data.get('payment_method', 'payme')
        else:
            bot_type = request.POST.get('bot_type', 'Telegram Bot')
            price    = request.POST.get('price', 0)
            method   = request.POST.get('payment_method', 'payme')

        order = BotOrder.objects.create(
            user=request.user,
            order_id=gen_id(),
            bot_type=bot_type,
            price=price,
            status=1,
            payment_status='pending',
            payment_method='',
        )
        # Return JSON with redirect URL for JS fetch
        if request.content_type and 'application/json' in request.content_type:
            if method == 'payme':
                url = f'/payment/payme/{order.order_id}/'
            elif method == 'click':
                url = f'/payment/click/{order.order_id}/'
            else:
                url = '/orders/'
            return JsonResponse({'ok': True, 'redirect': url, 'order_id': order.order_id})

        # Normal form POST
        if method == 'payme':
            return redirect('pay_payme', order_id=order.order_id)
        elif method == 'click':
            return redirect('pay_click', order_id=order.order_id)
        return redirect('my_orders')
    return redirect('my_orders')

@login_required(login_url='login')
def order_detail(request, order_id):
    order = get_object_or_404(BotOrder, order_id=order_id, user=request.user)
    return render(request, 'orders/order_detail.html', {'order': order})

# ─────────────── PAYMENT PAGES ───────────────
# PAYME — show payment page with button linking to Payme checkout
PAYME_MERCHANT_ID = 'YOUR_PAYME_MERCHANT_ID'   # ← replace after registration
CLICK_SERVICE_ID  = 'YOUR_CLICK_SERVICE_ID'    # ← replace after registration
CLICK_MERCHANT_ID = 'YOUR_CLICK_MERCHANT_ID'   # ← replace after registration

@login_required(login_url='login')
def pay_payme(request, order_id):
    order = get_object_or_404(BotOrder, order_id=order_id, user=request.user)
    # amount in tiyin (1 USD ~ 12 800 UZS, 1 UZS = 100 tiyin)
    amount_tiyin = int(float(order.price) * 12800 * 100)
    # base64 encode: m=MERCHANT_ID;ac.order_id=ORDER_ID;a=AMOUNT
    raw = f'm={PAYME_MERCHANT_ID};ac.order_id={order.order_id};a={amount_tiyin};c=https://botsmith.uz/payment/success/'
    encoded = base64.b64encode(raw.encode()).decode()
    payme_url = f'https://checkout.paycom.uz/{encoded}'
    return render(request, 'orders/pay_payme.html', {
        'order': order, 'payme_url': payme_url, 'amount_uzs': int(float(order.price) * 12800)
    })

@login_required(login_url='login')
def pay_click(request, order_id):
    order = get_object_or_404(BotOrder, order_id=order_id, user=request.user)
    amount_uzs = int(float(order.price) * 12800)
    click_url = (
        f'https://my.click.uz/services/pay?service_id={CLICK_SERVICE_ID}'
        f'&merchant_id={CLICK_MERCHANT_ID}'
        f'&amount={amount_uzs}'
        f'&transaction_param={order.order_id}'
        f'&return_url=https://botsmith.uz/payment/success/'
    )
    return render(request, 'orders/pay_click.html', {
        'order': order, 'click_url': click_url, 'amount_uzs': amount_uzs
    })

def payment_success(request):
    order_id = request.GET.get('order_id') or request.GET.get('transaction_param','')
    order = None
    if order_id:
        try:
            order = BotOrder.objects.get(order_id=order_id)
            if order.payment_status != 'paid':
                order.payment_status = 'paid'
                order.save()
        except BotOrder.DoesNotExist:
            pass
    return render(request, 'orders/payment_success.html', {'order': order})

# ─── PAYME server callback (SUBSCRIBE API) ───
@csrf_exempt
def payme_callback(request):
    if request.method != 'POST':
        return JsonResponse({'error': {'code': -32300, 'message': 'Transport error'}})
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': {'code': -32700, 'message': 'Parse error'}})

    method = data.get('method','')
    params = data.get('params', {})
    _id    = data.get('id', 1)

    if method == 'CheckPerformTransaction':
        order_id = params.get('account', {}).get('order_id','')
        try:
            BotOrder.objects.get(order_id=order_id)
            return JsonResponse({'result': {'allow': True}, 'id': _id})
        except BotOrder.DoesNotExist:
            return JsonResponse({'error': {'code': -31050, 'message': 'Order not found'}, 'id': _id})

    elif method == 'PerformTransaction':
        order_id   = params.get('account', {}).get('order_id','')
        payment_id = params.get('id','')
        try:
            order = BotOrder.objects.get(order_id=order_id)
            order.payment_status = 'paid'
            order.payment_method = 'payme'
            order.payment_id     = str(payment_id)
            order.save()
            import time
            return JsonResponse({'result': {'transaction': str(order.pk), 'perform_time': int(time.time()*1000), 'state': 2}, 'id': _id})
        except BotOrder.DoesNotExist:
            return JsonResponse({'error': {'code': -31050, 'message': 'Order not found'}, 'id': _id})

    return JsonResponse({'result': {}, 'id': _id})

# ─── CLICK server callback ───
@csrf_exempt
def click_callback(request):
    if request.method != 'POST':
        return JsonResponse({'error': -1, 'error_note': 'bad method'})
    order_id   = request.POST.get('merchant_trans_id','')
    payment_id = request.POST.get('click_trans_id','')
    action     = request.POST.get('action','')           # 0=prepare, 1=complete
    error_code = request.POST.get('error','0')

    try:
        order = BotOrder.objects.get(order_id=order_id)
    except BotOrder.DoesNotExist:
        return JsonResponse({'error': -5, 'error_note': 'Order not found'})

    if action == '1' and error_code == '0':
        order.payment_status = 'paid'
        order.payment_method = 'click'
        order.payment_id     = str(payment_id)
        order.save()

    return JsonResponse({'error': 0, 'error_note': 'Success',
                         'click_trans_id': payment_id,
                         'merchant_trans_id': order_id,
                         'merchant_confirm_id': order.pk})

# ─────────────── ADMIN ───────────────
@login_required(login_url='admin_login')
@user_passes_test(is_admin, login_url='admin_login')
def admin_panel(request):
    orders = BotOrder.objects.select_related('user').all()
    users  = User.objects.filter(is_staff=False).prefetch_related('orders')

    # Stats for template
    total_orders   = orders.count()
    paid_orders    = orders.filter(payment_status='paid').count()
    # Revenue = all paid orders + all completed orders (status=5)
    revenue        = orders.filter(
        Q(payment_status='paid') | Q(status=5)
    ).aggregate(s=Sum('price'))['s'] or 0
    done_orders    = orders.filter(status=5).count()
    active_orders  = orders.filter(status__lt=5).count()
    total_clients  = users.count()

    return render(request, 'orders/admin_panel.html', {
        'orders': orders, 'users': users,
        'total_orders': total_orders, 'paid_orders': paid_orders,
        'revenue': revenue, 'done_orders': done_orders,
        'active_orders': active_orders, 'total_clients': total_clients,
    })

@login_required(login_url='admin_login')
@user_passes_test(is_admin, login_url='admin_login')
def admin_client_detail(request, user_id):
    client = get_object_or_404(User, pk=user_id, is_staff=False)
    orders = BotOrder.objects.filter(user=client)
    return render(request, 'orders/admin_client_detail.html', {'client': client, 'orders': orders})

@require_POST
def advance_step(request, order_id):
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    order = get_object_or_404(BotOrder, order_id=order_id)
    if order.status < 5:
        order.status += 1
        order.save()
    return JsonResponse({'status': order.status, 'label': order.get_status_display()})

@require_POST
def set_step(request, order_id):
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    order = get_object_or_404(BotOrder, order_id=order_id)
    data  = json.loads(request.body)
    step  = int(data.get('step', order.status))
    if 1 <= step <= 5:
        order.status = step
        order.save()
    return JsonResponse({'status': order.status, 'label': order.get_status_display()})

@require_POST
def mark_paid(request, order_id):
    """Admin manually marks order as paid"""
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    order = get_object_or_404(BotOrder, order_id=order_id)
    order.payment_status = 'paid'
    order.payment_method = 'manual'
    order.save()
    return JsonResponse({'ok': True, 'payment_status': 'paid'})


@require_POST
def set_price(request, order_id):
    """Admin applies discount — sets new price"""
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    order = get_object_or_404(BotOrder, order_id=order_id)
    data  = json.loads(request.body)
    new_price = float(data.get('price', order.price))
    if new_price < 0:
        return JsonResponse({'error': 'invalid price'}, status=400)
    order.price = new_price
    order.save()
    return JsonResponse({'ok': True, 'price': str(order.price)})


@require_POST
def deliver_bot(request, order_id):
    """Admin delivers bot credentials when marking as Done (status=5)"""
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    order = get_object_or_404(BotOrder, order_id=order_id)
    data = json.loads(request.body)
    bot_token    = data.get('bot_token', '').strip()
    bot_username = data.get('bot_username', '').strip().lstrip('@')
    admin_note   = data.get('admin_note', '').strip()

    if not bot_token or not bot_username:
        return JsonResponse({'error': 'token and username required'}, status=400)

    # Save delivery info
    BotDelivery.objects.update_or_create(
        order=order,
        defaults={
            'bot_token': bot_token,
            'bot_username': bot_username,
            'bot_url': f'https://t.me/{bot_username}',
            'admin_note': admin_note,
        }
    )
    # Set status to 5
    order.status = 5
    order.save()
    return JsonResponse({
        'ok': True,
        'status': 5,
        'label': 'Готово',
        'bot_url': f'https://t.me/{bot_username}',
    })

def order_status_api(request, order_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'unauthenticated'}, status=401)
    order = get_object_or_404(BotOrder, order_id=order_id)
    if not request.user.is_staff and order.user != request.user:
        return JsonResponse({'error': 'forbidden'}, status=403)
    return JsonResponse({'status': order.status, 'label': order.get_status_display(),
                         'payment_status': order.payment_status})

@require_POST
def change_client_password(request, user_id):
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'error': 'forbidden'}, status=403)
    data = json.loads(request.body)
    new_password = data.get('password', '').strip()
    if len(new_password) < 4:
        return JsonResponse({'error': 'Минимум 4 символа'}, status=400)
    user = get_object_or_404(User, pk=user_id, is_staff=False)
    user.set_password(new_password)
    user.save()
    return JsonResponse({'ok': True, 'username': user.username})
