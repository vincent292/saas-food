alter table orders
  add column if not exists print_requested_at timestamptz;

create index if not exists idx_orders_pending_direct_print
  on orders(restaurant_id, print_requested_at)
  where print_requested_at is not null and printed_at is null;

create or replace function public.queue_direct_print_on_order_approval()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_connector_token text;
begin
  if new.status = 'accepted'
    and new.payment_status = 'paid'
    and (old.status is distinct from 'accepted' or old.payment_status is distinct from 'paid') then
    select connector.token
      into v_connector_token
      from restaurant_print_connectors connector
      join restaurant_settings settings
        on settings.restaurant_id = connector.restaurant_id
      where connector.restaurant_id = new.restaurant_id
        and connector.linked_at is not null
        and connector.revoked_at is null
        and settings.auto_print_kitchen = true
      limit 1;

    if v_connector_token is not null then
      new.print_requested_at = coalesce(new.print_requested_at, now());

      perform realtime.send(
        jsonb_build_object('orderId', new.id),
        'print-job',
        'print:' || encode(digest(v_connector_token, 'sha256'), 'hex'),
        false
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists queue_direct_print_on_order_approval on orders;
create trigger queue_direct_print_on_order_approval
  before update of status, payment_status on orders
  for each row execute function public.queue_direct_print_on_order_approval();
