-- Preserve the exact previous references for recovery/history. Files are not
-- deleted. Old clients (including an Edge Function not yet deployable) must not
-- advertise a static QR that cannot be reconciled to a bank request.
create table public.bank_legacy_static_qr_archive (
  restaurant_id uuid primary key references public.restaurants(id) on delete restrict,
  qr_payment_url text not null, archived_at timestamptz not null default now()
);
alter table public.bank_legacy_static_qr_archive enable row level security;
revoke all on public.bank_legacy_static_qr_archive from public,anon,authenticated;
grant select on public.bank_legacy_static_qr_archive to service_role;
insert into public.bank_legacy_static_qr_archive(restaurant_id,qr_payment_url)
  select restaurant_id,qr_payment_url from public.restaurant_settings where coalesce(qr_payment_url,'')<>'';
update public.restaurant_settings set qr_payment_url=null where coalesce(qr_payment_url,'')<>'';
create function public.guard_static_payment_qr() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.qr_payment_url,'')<>'' then raise exception 'bank-qr-only'; end if;
  return new;
end $$;
create trigger guard_static_payment_qr before insert or update of qr_payment_url on public.restaurant_settings
  for each row execute function public.guard_static_payment_qr();
revoke all on function public.guard_static_payment_qr() from public,anon,authenticated,service_role;
