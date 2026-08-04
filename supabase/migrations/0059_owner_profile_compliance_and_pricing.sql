alter table profiles
  add column if not exists document_number text,
  add column if not exists document_number_normalized text,
  add column if not exists birth_date date,
  add column if not exists owner_profile_completed_at timestamptz;

update profiles
set document_number_normalized = regexp_replace(coalesce(document_number, ''), '[^a-zA-Z0-9]', '', 'g')
where document_number is not null
  and (document_number_normalized is null or document_number_normalized = '');

create index if not exists profiles_document_number_normalized_idx
  on profiles (document_number_normalized)
  where document_number_normalized is not null and document_number_normalized <> '';

alter table subscription_plans
  add column if not exists additional_restaurant_price_monthly numeric(12,2) not null default 199;

update subscription_plans
set
  additional_restaurant_price_monthly = 199,
  description = 'Todo incluido. La primera sucursal cuesta Bs 450/mes y cada sucursal adicional Bs 199/mes.',
  updated_at = now()
where key = 'premium';
