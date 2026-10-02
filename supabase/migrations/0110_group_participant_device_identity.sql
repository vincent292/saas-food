alter table group_order_participants add column if not exists device_token text;
create unique index if not exists group_participant_one_device_per_session
  on group_order_participants(session_id, device_token)
  where device_token is not null;
