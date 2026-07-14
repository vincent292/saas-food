do $$ begin
  create type business_type as enum ('food', 'fashion', 'footwear', 'pharmacy', 'market', 'beauty', 'home', 'electronics', 'services', 'other');
exception when duplicate_object then null;
end $$;

alter table restaurants
  add column if not exists business_type business_type;

update restaurants
set business_type = 'food'::business_type
where business_type is null;

alter table restaurants
  alter column business_type set default 'food';

alter table restaurants
  alter column business_type set not null;
