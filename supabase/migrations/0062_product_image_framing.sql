alter table products
  add column if not exists image_position_x numeric(5,2) not null default 50,
  add column if not exists image_position_y numeric(5,2) not null default 50,
  add column if not exists image_zoom numeric(4,2) not null default 1;

alter table products
  drop constraint if exists products_image_position_x_check,
  add constraint products_image_position_x_check check (image_position_x between 0 and 100),
  drop constraint if exists products_image_position_y_check,
  add constraint products_image_position_y_check check (image_position_y between 0 and 100),
  drop constraint if exists products_image_zoom_check,
  add constraint products_image_zoom_check check (image_zoom between 1 and 2);
