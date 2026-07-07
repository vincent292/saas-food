alter table restaurants
  add column if not exists public_category text;

create index if not exists idx_restaurants_public_category
  on restaurants(public_category)
  where public_category is not null;
