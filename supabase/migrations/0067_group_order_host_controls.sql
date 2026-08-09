alter table group_order_participants
  add column if not exists payment_receipt_url text,
  add column if not exists payment_receipt_uploaded_at timestamptz;

create index if not exists group_order_participants_payment_status_idx
  on group_order_participants (session_id, payment_status);
