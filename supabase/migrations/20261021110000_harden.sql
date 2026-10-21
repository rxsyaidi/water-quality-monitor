-- Hardening before the app goes public (security review, 21 Okt 2026).
-- 1. The shared demo account cannot change its password, email or flags, or be deleted.
-- 2. Calibration rejects fits a real probe could never give, so nobody can break a tank's readings.
-- 3. Caps on tanks per person and test runs per tank, so an open sign-up cannot fill the database.
-- 4. Only the board's ingest is callable without signing in; the rest needs a session.

-- 1. demo account is read only ------------------------------------------------------------------
create function public.protect_demo_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.raw_app_meta_data ->> 'demo' = 'true' and (
       tg_op = 'DELETE'
    or new.encrypted_password is distinct from old.encrypted_password
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.raw_app_meta_data -> 'demo' is distinct from old.raw_app_meta_data -> 'demo') then
    raise exception 'the demo account is read only' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.protect_demo_user() from public, anon, authenticated;

create trigger protect_demo_user before update or delete on auth.users
  for each row execute function public.protect_demo_user();

-- 2. calibration within what a probe can give -------------------------------------------------------
create or replace function public.save_calibration(p_device uuid, p_sensor text, p_points jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int; sx numeric; sy numeric; sxx numeric; sxy numeric; slope numeric; off numeric; cv numeric;
begin
  if not public.owns(p_device) then raise exception 'not your device' using errcode = '42501'; end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) > 10 or pg_column_size(p_points) > 4000 then
    raise exception 'too many calibration points';
  end if;
  if p_sensor = 'ph' then
    select count(*), sum(v), sum(ph), sum(v * v), sum(v * ph)
    into n, sx, sy, sxx, sxy
    from jsonb_to_recordset(p_points) as x(ph numeric, v numeric);
    if n < 2 then raise exception 'pH calibration needs at least two buffers'; end if;
    if n * sxx - sx * sx = 0 then raise exception 'the voltages are identical, capture each buffer again'; end if;
    slope := (n * sxy - sx * sy) / (n * sxx - sx * sx);
    off := (sy - slope * sx) / n;
    if slope is null or abs(slope) < 0.5 or abs(slope) > 20 or abs(off) > 100 then
      raise exception 'that fit is outside what a pH probe gives, capture each buffer again';
    end if;
    update public.devices set ph_slope = round(slope, 4), ph_offset = round(off, 4), calibrated_at = now() where id = p_device;
    insert into public.calibrations (device_id, sensor, points, ph_slope, ph_offset)
    values (p_device, 'ph', p_points, round(slope, 4), round(off, 4));
    insert into public.events (device_id, kind, detail)
    values (p_device, 'calibrated', format('pH calibrated with %s buffers: slope %s, offset %s', n, round(slope, 3), round(off, 3)));
    return jsonb_build_object('ph_slope', round(slope, 4), 'ph_offset', round(off, 4));
  elsif p_sensor = 'ntu' then
    cv := (p_points -> 0 ->> 'v')::numeric;
    if cv is null or cv < 0.1 or cv > 5 then raise exception 'clear water voltage must be between 0.1 and 5 V'; end if;
    update public.devices set clear_volt = round(cv, 3), calibrated_at = now() where id = p_device;
    insert into public.calibrations (device_id, sensor, points, clear_volt) values (p_device, 'ntu', p_points, round(cv, 3));
    insert into public.events (device_id, kind, detail)
    values (p_device, 'calibrated', format('Turbidity calibrated: clear water reads %s V', round(cv, 3)));
    return jsonb_build_object('clear_volt', round(cv, 3));
  end if;
  raise exception 'unknown sensor %', p_sensor;
end $$;

-- 3. caps ----------------------------------------------------------------------------------------
create function public.cap_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'devices'
     and (select count(*) from public.devices where owner_id = new.owner_id) >= 3 then
    raise exception 'one account can have up to 3 tanks';
  end if;
  if tg_table_name = 'test_runs'
     and (select count(*) from public.test_runs where device_id = new.device_id) >= 200 then
    raise exception 'this tank already has 200 test runs';
  end if;
  return new;
end $$;
revoke execute on function public.cap_rows() from public, anon, authenticated;

create trigger cap_devices before insert on public.devices for each row execute function public.cap_rows();
create trigger cap_test_runs before insert on public.test_runs for each row execute function public.cap_rows();

-- 4. grants --------------------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke delete on public.devices from anon, authenticated;

revoke execute on function
  public.tick_virtual(uuid),
  public.pour_virtual(uuid, text),
  public.save_calibration(uuid, text, jsonb),
  public.set_limits(uuid, numeric, numeric, numeric, integer, integer),
  public.new_device_key(uuid),
  public.fill_virtual_history(uuid),
  public.reading_stats(uuid, timestamptz, timestamptz),
  public.reading_series(uuid, timestamptz, interval),
  public.device_config(public.devices),
  public.out_reason(public.devices, numeric, numeric)
from public, anon;

grant execute on function
  public.tick_virtual(uuid),
  public.pour_virtual(uuid, text),
  public.save_calibration(uuid, text, jsonb),
  public.set_limits(uuid, numeric, numeric, numeric, integer, integer),
  public.new_device_key(uuid),
  public.fill_virtual_history(uuid),
  public.reading_stats(uuid, timestamptz, timestamptz),
  public.reading_series(uuid, timestamptz, interval)
to authenticated;
