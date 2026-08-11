alter table group_order_participants
  drop constraint if exists group_order_participants_payment_status_check;

alter table group_order_participants
  add constraint group_order_participants_payment_status_check
  check (payment_status in ('pending', 'qr_uploaded', 'paid_qr', 'cash_pending', 'covered_by_host', 'excluded'));
