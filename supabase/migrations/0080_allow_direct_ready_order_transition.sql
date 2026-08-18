create or replace function validate_order_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending' and new.status in ('accepted', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('preparing', 'ready', 'cancelled'))
    or (old.status = 'preparing' and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready' and new.status in ('delivered', 'cancelled'))
  ) then
    raise exception 'invalid-order-transition:%->%', old.status, new.status using errcode = '22023';
  end if;

  return new;
end;
$$;
