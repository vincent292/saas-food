alter table restaurants
  add column if not exists nav_background_color text not null default '#ffffff',
  add column if not exists nav_text_color text not null default '#142018';
