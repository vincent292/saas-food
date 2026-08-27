do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'orders',
      'order_delivery_links',
      'cash_sessions',
      'cash_movements',
      'inventory_items',
      'inventory_movements',
      'order_cancellation_reviews',
      'products',
      'tables'
    ]
    loop
      if to_regclass('public.' || realtime_table) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = realtime_table
        )
      then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end
$$;

create or replace function public.broadcast_public_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_order_id uuid;
  tracking_token text;
  delivery_token text;
begin
  if tg_table_name = 'orders' then
    changed_order_id := coalesce(new.id, old.id);
    tracking_token := coalesce(new.tracking_token, old.tracking_token);

    select link.delivery_token
    into delivery_token
    from public.order_delivery_links link
    where link.order_id = changed_order_id;
  else
    changed_order_id := coalesce(new.order_id, old.order_id);
    delivery_token := coalesce(new.delivery_token, old.delivery_token);

    select order_row.tracking_token
    into tracking_token
    from public.orders order_row
    where order_row.id = changed_order_id;
  end if;

  if tracking_token is not null then
    perform realtime.send(
      jsonb_build_object('order_id', changed_order_id),
      'changed',
      'order-tracking:' || tracking_token,
      false
    );
  end if;

  if delivery_token is not null then
    perform realtime.send(
      jsonb_build_object('order_id', changed_order_id),
      'changed',
      'delivery:' || delivery_token,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_public_order_change_trigger on public.orders;
create trigger broadcast_public_order_change_trigger
after insert or update on public.orders
for each row execute function public.broadcast_public_order_change();

drop trigger if exists broadcast_public_delivery_change_trigger on public.order_delivery_links;
create trigger broadcast_public_delivery_change_trigger
after insert or update or delete on public.order_delivery_links
for each row execute function public.broadcast_public_order_change();

create or replace function public.broadcast_group_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_session_id uuid;
  session_token text;
begin
  if tg_table_name = 'group_order_sessions' then
    changed_session_id := coalesce(new.id, old.id);
    session_token := coalesce(new.public_token, old.public_token);
  else
    changed_session_id := coalesce(new.session_id, old.session_id);

    select session_row.public_token
    into session_token
    from public.group_order_sessions session_row
    where session_row.id = changed_session_id;
  end if;

  if session_token is not null then
    perform realtime.send(
      jsonb_build_object('session_id', changed_session_id),
      'changed',
      'group-order:' || session_token,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_group_order_session_change_trigger on public.group_order_sessions;
create trigger broadcast_group_order_session_change_trigger
after insert or update or delete on public.group_order_sessions
for each row execute function public.broadcast_group_order_change();

drop trigger if exists broadcast_group_order_participant_change_trigger on public.group_order_participants;
create trigger broadcast_group_order_participant_change_trigger
after insert or update or delete on public.group_order_participants
for each row execute function public.broadcast_group_order_change();

drop trigger if exists broadcast_group_order_item_change_trigger on public.group_order_items;
create trigger broadcast_group_order_item_change_trigger
after insert or update or delete on public.group_order_items
for each row execute function public.broadcast_group_order_change();
