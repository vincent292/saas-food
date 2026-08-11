alter table products
  add column if not exists prep_minutes integer not null default 15;

alter table products
  drop constraint if exists products_prep_minutes_check,
  add constraint products_prep_minutes_check check (prep_minutes between 1 and 240);

alter table order_items
  add column if not exists prep_minutes integer;

update order_items oi
set prep_minutes = coalesce(p.prep_minutes, 15)
from products p
where oi.product_id = p.id
  and oi.prep_minutes is null;

update order_items
set prep_minutes = 15
where prep_minutes is null;

alter table order_items
  alter column prep_minutes set not null,
  drop constraint if exists order_items_prep_minutes_check,
  add constraint order_items_prep_minutes_check check (prep_minutes between 1 and 240);

create or replace function set_order_item_prep_minutes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep_minutes integer;
begin
  if new.prep_minutes is null then
    select p.prep_minutes
      into v_prep_minutes
      from products p
      where p.id = new.product_id;

    new.prep_minutes := coalesce(v_prep_minutes, 15);
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_set_prep_minutes on order_items;
create trigger order_items_set_prep_minutes
  before insert or update of product_id, prep_minutes
  on order_items
  for each row
  execute function set_order_item_prep_minutes();
