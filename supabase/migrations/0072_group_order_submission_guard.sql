alter table group_order_sessions
  drop constraint if exists group_order_sessions_status_check;

alter table group_order_sessions
  add constraint group_order_sessions_status_check
  check (status in ('open', 'locked', 'submitting', 'submitted', 'cancelled', 'expired'));
