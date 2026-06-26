alter table orders
  add column if not exists payment_receipt_url text,
  add column if not exists payment_receipt_uploaded_at timestamptz,
  add column if not exists payment_verified_at timestamptz;

create or replace function has_open_cash_session_public(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cash_sessions cs
    where cs.restaurant_id = p_restaurant_id
      and cs.status = 'open'
  );
$$;

grant execute on function has_open_cash_session_public(uuid) to anon, authenticated;
