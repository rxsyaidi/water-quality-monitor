-- Water Quality Monitor: devices, readings, events, test runs, calibrations.
-- The board decides and switches the pump; the cloud records, explains and shows.
-- Readings and events are written only through the functions below, never directly.

create extension if not exists pgcrypto with schema extensions;

-- Devices --------------------------------------------------------------------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Tank 1' check (char_length(name) between 1 and 40),
  key_hash text unique,              -- sha256 hex of the device key; the key itself is shown once
  key_hint text,                     -- last 4 characters, to recognise it
  ph_min numeric(4,2) not null default 6.5 check (ph_min between 0 and 14),
  ph_max numeric(4,2) not null default 8.5 check (ph_max between 0 and 14),
  ntu_max numeric(6,1) not null default 5 check (ntu_max between 0 and 4000),
  confirm_s int not null default 2 check (confirm_s between 1 and 60),
  restart_s int not null default 30 check (restart_s between 5 and 600),
  ph_slope numeric(8,4) not null default 3.5,
  ph_offset numeric(8,4) not null default 0,
  clear_volt numeric(6,3) not null default 4.2,
  calibrated_at timestamptz,
  last_seen_at timestamptz,
  last_ph numeric(5,2),
  last_ntu numeric(7,1),
  last_ph_v numeric(5,3),
  last_ntu_v numeric(5,3),
  pump_on boolean,
  state text check (state in ('safe', 'checking', 'stopped', 'restarting')),
  last_source text check (last_source in ('board', 'virtual')),
  created_at timestamptz not null default now(),
  check (ph_min < ph_max)
);
create index devices_owner on public.devices (owner_id);

-- Readings: one row every 2 s from the board (or 1 min for back-filled simulated history)

create table public.readings (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices on delete cascade,
  at timestamptz not null default now(),
  ph numeric(5,2) not null,
  ntu numeric(7,1) not null,
  ph_v numeric(5,3),
  ntu_v numeric(5,3),
  pump_on boolean not null,
  state text not null check (state in ('safe', 'checking', 'stopped', 'restarting')),
  source text not null default 'board' check (source in ('board', 'virtual'))
);
create index readings_device_at on public.readings (device_id, at desc);

-- Events: what the board did, in words

create table public.events (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('checking', 'stopped', 'back_in_range', 'restarted', 'false_alarm',
                                     'offline', 'calibrated', 'limits_changed', 'connected')),
  ph numeric(5,2),
  ntu numeric(7,1),
  detail text not null,
  ended_at timestamptz                -- stopped: when the pump came back; offline: when readings resumed
);
create index events_device_at on public.events (device_id, at desc);

-- Test runs: the planned experiments for the report (tap water, pH 9 buffer, muddy water)

create table public.test_runs (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices on delete cascade,
  sample text not null check (char_length(sample) between 1 and 80),
  expect text not null check (expect in ('runs', 'stops')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text check (char_length(notes) <= 1000)
);
create index test_runs_device on public.test_runs (device_id, started_at desc);

-- Calibrations: each saved calibration, with the points it came from

create table public.calibrations (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices on delete cascade,
  at timestamptz not null default now(),
  sensor text not null check (sensor in ('ph', 'ntu')),
  points jsonb not null,
  ph_slope numeric(8,4),
  ph_offset numeric(8,4),
  clear_volt numeric(6,3)
);
create index calibrations_device on public.calibrations (device_id, at desc);

-- Row level security: a person sees only their own devices and what belongs to them

alter table public.devices enable row level security;
alter table public.readings enable row level security;
alter table public.events enable row level security;
alter table public.test_runs enable row level security;
alter table public.calibrations enable row level security;

create function public.owns(p_device uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.devices d where d.id = p_device and d.owner_id = (select auth.uid()))
$$;

create policy "own devices: read" on public.devices for select to authenticated using (owner_id = (select auth.uid()));
create policy "own devices: add" on public.devices for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own devices: change" on public.devices for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own readings: read" on public.readings for select to authenticated using (public.owns(device_id));
create policy "own events: read" on public.events for select to authenticated using (public.owns(device_id));

create policy "own test runs: read" on public.test_runs for select to authenticated using (public.owns(device_id));
create policy "own test runs: add" on public.test_runs for insert to authenticated with check (public.owns(device_id));
create policy "own test runs: change" on public.test_runs for update to authenticated
  using (public.owns(device_id)) with check (public.owns(device_id));

create policy "own calibrations: read" on public.calibrations for select to authenticated using (public.owns(device_id));

-- Columns a person may change on their device directly; the rest go through functions
revoke insert, update on public.devices from anon, authenticated;
grant insert (name), update (name) on public.devices to authenticated;
revoke insert, update, delete on public.readings, public.events, public.calibrations from anon, authenticated;
revoke all on public.test_runs from anon;

-- Helpers --------------------------------------------------------------------

create function public.out_reason(d public.devices, p_ph numeric, p_ntu numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_ph > d.ph_max then format('pH %s is above the %s limit', p_ph, d.ph_max)
    when p_ph < d.ph_min then format('pH %s is below the %s limit', p_ph, d.ph_min)
    when p_ntu > d.ntu_max then format('Turbidity %s NTU is above the %s NTU limit', p_ntu, d.ntu_max)
    else null end
$$;

create function public.device_config(d public.devices) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ph_min', d.ph_min, 'ph_max', d.ph_max, 'ntu_max', d.ntu_max,
    'confirm_s', d.confirm_s, 'restart_s', d.restart_s,
    'ph_slope', d.ph_slope, 'ph_offset', d.ph_offset, 'clear_volt', d.clear_volt)
$$;

-- Records one reading and turns state changes into events. Shared by the board and the virtual board.
create function public.record_reading(d public.devices, p_ph numeric, p_ntu numeric, p_pump_on boolean,
  p_state text, p_ph_v numeric, p_ntu_v numeric, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  prev text := coalesce(d.state, 'safe');
  why text := public.out_reason(d, p_ph, p_ntu);
  gap interval := now() - d.last_seen_at;
begin
  if p_ph is null or p_ph < 0 or p_ph > 14 then raise exception 'pH must be between 0 and 14'; end if;
  if p_ntu is null or p_ntu < 0 or p_ntu > 4000 then raise exception 'turbidity must be between 0 and 4000 NTU'; end if;
  if p_state not in ('safe', 'checking', 'stopped', 'restarting') then raise exception 'unknown state %', p_state; end if;

  if d.last_seen_at is null then
    insert into public.events (device_id, kind, detail)
    values (d.id, 'connected', case when p_source = 'virtual' then 'Virtual board sent its first reading'
                                    else 'Board sent its first reading' end);
  elsif gap > interval '60 seconds' then
    insert into public.events (device_id, at, kind, detail, ended_at)
    values (d.id, d.last_seen_at, 'offline',
            format('No readings for %s', case when gap < interval '1 hour' then ceil(extract(epoch from gap) / 60) || ' min'
                                              else round(extract(epoch from gap) / 3600, 1) || ' h' end),
            now());
  end if;

  insert into public.readings (device_id, ph, ntu, ph_v, ntu_v, pump_on, state, source)
  values (d.id, p_ph, p_ntu, p_ph_v, p_ntu_v, p_pump_on, p_state, p_source);

  if p_state <> prev then
    if p_state = 'checking' then
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'checking', p_ph, p_ntu, coalesce(why, 'Reading out of range') || format(', confirming for %s s', d.confirm_s));
    elsif p_state = 'stopped' then
      update public.events set ended_at = now() where device_id = d.id and kind = 'checking' and ended_at is null;
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'stopped', p_ph, p_ntu, coalesce(why, 'Reading out of range'));
    elsif p_state = 'restarting' then
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'back_in_range', p_ph, p_ntu, format('pH %s, %s NTU. Restarting after %s s in range', p_ph, p_ntu, d.restart_s));
    elsif p_state = 'safe' and prev = 'checking' then
      update public.events set ended_at = now() where device_id = d.id and kind = 'checking' and ended_at is null;
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'false_alarm', p_ph, p_ntu, 'Back in range before it was confirmed. The pump kept running');
    elsif p_state = 'safe' then
      update public.events set ended_at = now() where device_id = d.id and kind = 'stopped' and ended_at is null;
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'restarted', p_ph, p_ntu, format('After %s s back in range', d.restart_s));
    end if;
  end if;

  update public.devices set last_seen_at = now(), last_ph = p_ph, last_ntu = p_ntu, last_ph_v = p_ph_v,
    last_ntu_v = p_ntu_v, pump_on = p_pump_on, state = p_state, last_source = p_source
  where id = d.id;
end $$;
revoke all on function public.record_reading from public, anon, authenticated;

-- Board endpoint: POST /rest/v1/rpc/ingest with the publishable key and the device key.
-- Returns the limits and calibration so the board always runs the current settings.
create function public.ingest(p_key text, p_ph numeric, p_ntu numeric, p_pump_on boolean, p_state text,
  p_ph_v numeric default null, p_ntu_v numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices;
begin
  select * into d from public.devices
  where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') for update;
  if not found then raise exception 'unknown device key' using errcode = '28000'; end if;
  if d.last_seen_at > now() - interval '500 milliseconds' then
    return public.device_config(d) || jsonb_build_object('ok', false, 'why', 'too fast, send every 2 s');
  end if;
  perform public.record_reading(d, round(p_ph, 2), round(p_ntu, 1), p_pump_on, p_state, p_ph_v, p_ntu_v, 'board');
  return public.device_config(d) || jsonb_build_object('ok', true);
end $$;
grant execute on function public.ingest to anon, authenticated;

-- Virtual board: the owner's browser sends simulated readings without a device key.
create function public.ingest_virtual(p_device uuid, p_ph numeric, p_ntu numeric, p_pump_on boolean, p_state text,
  p_ph_v numeric default null, p_ntu_v numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices;
begin
  select * into d from public.devices where id = p_device and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  if d.last_source = 'board' and d.last_seen_at > now() - interval '1 minute' then
    raise exception 'the real board is online, so the virtual board stays off';
  end if;
  -- two open tabs share one virtual board: the second one is ignored
  if d.last_seen_at > now() - interval '1500 milliseconds' then
    return public.device_config(d) || jsonb_build_object('ok', false);
  end if;
  perform public.record_reading(d, round(p_ph, 2), round(p_ntu, 1), p_pump_on, p_state, p_ph_v, p_ntu_v, 'virtual');
  return public.device_config(d) || jsonb_build_object('ok', true);
end $$;
grant execute on function public.ingest_virtual to authenticated;

-- New device key. Returned once; only its hash is stored.
create function public.new_device_key(p_device uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k text := 'wqm_' || encode(extensions.gen_random_bytes(18), 'hex');
begin
  update public.devices set key_hash = encode(extensions.digest(k, 'sha256'), 'hex'), key_hint = right(k, 4)
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  return k;
end $$;
grant execute on function public.new_device_key to authenticated;

-- Limits and timing, with an event so the change shows in the record.
create function public.set_limits(p_device uuid, p_ph_min numeric, p_ph_max numeric, p_ntu_max numeric,
  p_confirm_s int, p_restart_s int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.devices set ph_min = p_ph_min, ph_max = p_ph_max, ntu_max = p_ntu_max,
    confirm_s = p_confirm_s, restart_s = p_restart_s
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  insert into public.events (device_id, kind, detail)
  values (p_device, 'limits_changed', format('Safe range set to pH %s to %s, turbidity up to %s NTU. Confirm %s s, restart %s s',
          p_ph_min, p_ph_max, p_ntu_max, p_confirm_s, p_restart_s));
end $$;
grant execute on function public.set_limits to authenticated;

-- Calibration. pH: two or three buffer points, least squares fit of pH = slope * volts + offset
-- (the same formula the sketch uses). Turbidity: the sensor's voltage in clear water.
create function public.save_calibration(p_device uuid, p_sensor text, p_points jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int; sx numeric; sy numeric; sxx numeric; sxy numeric; slope numeric; off numeric; cv numeric;
begin
  if not public.owns(p_device) then raise exception 'not your device' using errcode = '42501'; end if;
  if p_sensor = 'ph' then
    select count(*), sum(v), sum(ph), sum(v * v), sum(v * ph)
    into n, sx, sy, sxx, sxy
    from jsonb_to_recordset(p_points) as x(ph numeric, v numeric);
    if n < 2 then raise exception 'pH calibration needs at least two buffers'; end if;
    if n * sxx - sx * sx = 0 then raise exception 'the voltages are identical, capture each buffer again'; end if;
    slope := (n * sxy - sx * sy) / (n * sxx - sx * sx);
    off := (sy - slope * sx) / n;
    update public.devices set ph_slope = round(slope, 4), ph_offset = round(off, 4), calibrated_at = now() where id = p_device;
    insert into public.calibrations (device_id, sensor, points, ph_slope, ph_offset)
    values (p_device, 'ph', p_points, round(slope, 4), round(off, 4));
    insert into public.events (device_id, kind, detail)
    values (p_device, 'calibrated', format('pH calibrated with %s buffers: slope %s, offset %s', n, round(slope, 3), round(off, 3)));
    return jsonb_build_object('ph_slope', round(slope, 4), 'ph_offset', round(off, 4));
  elsif p_sensor = 'ntu' then
    cv := (p_points -> 0 ->> 'v')::numeric;
    if cv is null or cv <= 0 or cv > 5 then raise exception 'clear water voltage must be between 0 and 5 V'; end if;
    update public.devices set clear_volt = round(cv, 3), calibrated_at = now() where id = p_device;
    insert into public.calibrations (device_id, sensor, points, clear_volt) values (p_device, 'ntu', p_points, round(cv, 3));
    insert into public.events (device_id, kind, detail)
    values (p_device, 'calibrated', format('Turbidity calibrated: clear water reads %s V', round(cv, 3)));
    return jsonb_build_object('clear_volt', round(cv, 3));
  end if;
  raise exception 'unknown sensor %', p_sensor;
end $$;
grant execute on function public.save_calibration to authenticated;

-- Chart series in buckets. Keeps the extreme value of a bucket when it left the safe range,
-- so a short spike still shows on a 30 day chart.
create function public.reading_series(p_device uuid, p_from timestamptz, p_bucket interval)
returns table (t timestamptz, ph numeric, ntu numeric, n bigint)
language sql stable security invoker set search_path = '' as $$
  select date_bin(p_bucket, r.at, p_from) as t,
    case when max(r.ph) > max(d.ph_max) then max(r.ph)
         when min(r.ph) < max(d.ph_min) then min(r.ph)
         else round(avg(r.ph), 2) end as ph,
    case when max(r.ntu) > max(d.ntu_max) then max(r.ntu) else round(avg(r.ntu), 1) end as ntu,
    count(*) as n
  from public.readings r join public.devices d on d.id = r.device_id
  where r.device_id = p_device and r.at >= p_from
  group by 1 order by 1
$$;

-- Summary numbers for a window: min, mean, max and share of readings in range.
create function public.reading_stats(p_device uuid, p_from timestamptz, p_to timestamptz default now())
returns table (n bigint, ph_min numeric, ph_avg numeric, ph_max numeric, ntu_min numeric, ntu_avg numeric,
               ntu_max numeric, in_range_pct numeric)
language sql stable security invoker set search_path = '' as $$
  select count(*), min(r.ph), round(avg(r.ph), 2), max(r.ph), min(r.ntu), round(avg(r.ntu), 1), max(r.ntu),
    round(100.0 * count(*) filter (where r.ph between d.ph_min and d.ph_max and r.ntu <= d.ntu_max) / nullif(count(*), 0), 1)
  from public.readings r join public.devices d on d.id = r.device_id
  where r.device_id = p_device and r.at >= p_from and r.at <= p_to
  group by d.id
$$;

-- Simulated history for a virtual device, so a new or idle demo is not empty.
-- Fills the gap since the last reading (at most 24 h) at one reading a minute, with one pH spike
-- 20 h ago if that falls in the gap. Only for devices that have never had a real board.
create function public.fill_virtual_history(p_device uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  d public.devices;
  t0 timestamptz;
  spike timestamptz := date_trunc('minute', now() - interval '20 hours 10 minutes');
  added int;
begin
  select * into d from public.devices where id = p_device and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  if exists (select 1 from public.readings where device_id = p_device and source = 'board') then return 0; end if;
  t0 := greatest(coalesce(d.last_seen_at, now() - interval '24 hours'), now() - interval '24 hours');
  if t0 > now() - interval '2 hours' then return 0; end if;

  insert into public.readings (device_id, at, ph, ntu, pump_on, state, source)
  select p_device, g.at,
    round(case
      when g.at >= spike - interval '2 minutes' and g.at < spike then 8.1 + random() * 0.2
      when g.at >= spike and g.at < spike + interval '8 minutes' then 8.95 + random() * 0.08
      else 7.2 + 0.14 * sin(extract(epoch from g.at) / 7200.0) + (random() - 0.5) * 0.08 end, 2),
    round(1.7 + 0.45 * sin(extract(epoch from g.at) / 9900.0 + 1) + random() * 0.35, 1),
    not (g.at >= spike and g.at < spike + interval '9 minutes'),
    case when g.at >= spike and g.at < spike + interval '8 minutes' then 'stopped'
         when g.at >= spike + interval '8 minutes' and g.at < spike + interval '9 minutes' then 'restarting'
         else 'safe' end,
    'virtual'
  from generate_series(date_trunc('minute', t0) + interval '1 minute', now() - interval '30 seconds', interval '1 minute') as g(at);
  get diagnostics added = row_count;

  if spike > t0 then
    insert into public.events (device_id, at, kind, ph, ntu, detail, ended_at) values
      (p_device, spike - interval '2 seconds', 'checking', 8.92, 2.4, format('pH 8.92 is above the %s limit, confirming for %s s', d.ph_max, d.confirm_s), spike),
      (p_device, spike, 'stopped', 9.02, 3.1, format('pH 9.02 is above the %s limit', d.ph_max), spike + interval '9 minutes'),
      (p_device, spike + interval '8 minutes 30 seconds', 'back_in_range', 7.6, 2.6, format('pH 7.60, 2.6 NTU. Restarting after %s s in range', d.restart_s), null),
      (p_device, spike + interval '9 minutes', 'restarted', 7.48, 2.2, format('After %s s back in range', d.restart_s), null);
  end if;

  update public.devices set last_seen_at = now() - interval '30 seconds', last_source = 'virtual',
    last_ph = coalesce(last_ph, 7.21), last_ntu = coalesce(last_ntu, 1.8), pump_on = true, state = 'safe'
  where id = p_device;
  return added;
end $$;
grant execute on function public.fill_virtual_history to authenticated;

-- Live updates for the app
alter publication supabase_realtime add table public.devices, public.events;
