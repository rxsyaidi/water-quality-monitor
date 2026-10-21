-- The demo account is shared by every visitor, so it can watch, test and calibrate, but cannot change the
-- limits, rename or add tanks, or create a board key. The flag lives in app_metadata, which only the
-- service key can set (user_metadata is editable by the user).

create function public.is_demo() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'demo')::boolean, false)
$$;

drop policy "own devices: add" on public.devices;
create policy "own devices: add" on public.devices for insert to authenticated
  with check (owner_id = (select auth.uid()) and not (select public.is_demo()));

drop policy "own devices: change" on public.devices;
create policy "own devices: change" on public.devices for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and not (select public.is_demo()));

create or replace function public.set_limits(p_device uuid, p_ph_min numeric, p_ph_max numeric, p_ntu_max numeric,
  p_confirm_s int, p_restart_s int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_demo() then raise exception 'the demo tank keeps its limits' using errcode = '42501'; end if;
  update public.devices set ph_min = p_ph_min, ph_max = p_ph_max, ntu_max = p_ntu_max,
    confirm_s = p_confirm_s, restart_s = p_restart_s
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  insert into public.events (device_id, kind, detail)
  values (p_device, 'limits_changed', format('Safe range set to pH %s to %s, turbidity up to %s NTU. Confirm %s s, restart %s s',
          trim_scale(p_ph_min), trim_scale(p_ph_max), trim_scale(p_ntu_max), p_confirm_s, p_restart_s));
end $$;

create or replace function public.new_device_key(p_device uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k text := 'wqm_' || encode(extensions.gen_random_bytes(18), 'hex');
begin
  if public.is_demo() then raise exception 'the demo tank cannot take a real board' using errcode = '42501'; end if;
  update public.devices set key_hash = encode(extensions.digest(k, 'sha256'), 'hex'), key_hint = right(k, 4)
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  return k;
end $$;
