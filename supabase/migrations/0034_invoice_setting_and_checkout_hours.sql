alter table restaurant_settings
  add column if not exists invoice_enabled boolean not null default false;
