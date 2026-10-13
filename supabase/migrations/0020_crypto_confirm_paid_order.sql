-- Confirming a crypto payment whose order was already marked paid by hand must not fail: just
-- close the payment. The order is only moved to "paid" while it is still waiting for payment.
create or replace function public.admin_resolve_crypto_payment(p_payment uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pay public.crypto_payments;
  v_status public.order_status;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_pay from public.crypto_payments where id = p_payment for update;
  if not found or v_pay.status <> 'submitted' then raise exception 'payment_not_found'; end if;
  if p_confirm then
    select status into v_status from public.orders where id = v_pay.order_id;
    if v_status = 'pending_payment' then
      perform public.admin_set_order_status(v_pay.order_id, 'paid');
    end if;
    update public.crypto_payments set status = 'confirmed' where id = p_payment;
  else
    update public.crypto_payments set status = 'rejected' where id = p_payment;
  end if;
end $$;
