alter table whatsapp_order_drafts
  add column if not exists checkout_step text not null default 'catalog',
  add column if not exists pending_item jsonb,
  add column if not exists customer_address_detail text,
  add column if not exists delivery_latitude numeric(10, 7),
  add column if not exists delivery_longitude numeric(10, 7),
  add column if not exists delivery_maps_url text,
  add column if not exists delivery_distance_km numeric(8, 2),
  add column if not exists delivery_fee numeric(12, 2) not null default 0,
  add column if not exists requires_prepayment boolean not null default false,
  add column if not exists requested_fulfillment_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists payment_receipt_url text,
  add column if not exists payment_receipt_media_id text,
  add column if not exists invoice_required boolean,
  add column if not exists invoice_document_type text,
  add column if not exists invoice_document_number text,
  add column if not exists invoice_name text;

alter table whatsapp_order_drafts
  drop constraint if exists whatsapp_order_drafts_payment_method_check;

alter table whatsapp_order_drafts
  add constraint whatsapp_order_drafts_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'qr'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-payment-receipts',
  'whatsapp-payment-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

