alter table restaurant_settings
  add column if not exists delivery_qr_prepayment_enabled boolean not null default true;

alter table restaurant_settings
  alter column far_delivery_distance_km set default 5;

update restaurant_settings
set far_delivery_distance_km = 5
where far_delivery_distance_km is null
  or far_delivery_distance_km = 8;

alter table restaurant_settings
  drop constraint if exists restaurant_settings_far_delivery_distance_check,
  add constraint restaurant_settings_far_delivery_distance_check
    check (far_delivery_distance_km between 1 and 100);
