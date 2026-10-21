-- The virtual board now runs on the server. Every open tab (and every visitor of the shared demo) only asks
-- for the next reading, so they all see one state machine with one clock, instead of each tab running its
-- own and overwriting the others. A poured sample is stored on the device, so it holds for whoever ticks.
-- Also: devices.state_since (when the current state began, for honest countdowns), a "restart cancelled"
-- note when the water leaves the range again while restarting, a restart event when simulated history
-- closes an open stop, and reading_stats weighted by time instead of by count, with the board share.

alter table public.devices
  add column state_since timestamptz,
  add column sim_fault text check (sim_fault in ('ph', 'ntu')),
  add column sim_fault_until timestamptz;

update public.devices set state_since = last_seen_at where state_since is null;

create or replace function public.record_reading(d public.devices, p_ph numeric, p_ntu numeric, p_pump_on boolean,
  p_state text, p_ph_v numeric, p_ntu_v numeric, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  prev text := coalesce(d.state, 'safe');
  why text := public.out_reason(d, p_ph, p_ntu);
  gap interval := now() - d.last_seen_at;
  back record;
begin
  if p_ph is null or p_ph < 0 or p_ph > 14 then raise exception 'pH must be between 0 and 14'; end if;
  if p_ntu is null or p_ntu < 0 or p_ntu > 4000 then raise exception 'turbidity must be between 0 and 4000 NTU'; end if;
  if p_state not in ('safe', 'checking', 'stopped', 'restarting') then raise exception 'unknown state %', p_state; end if;

  if d.last_seen_at is null then
    insert into public.events (device_id, kind, detail)
    values (d.id, 'connected', case when p_source = 'virtual' then 'Virtual board sent its first reading'
                                    else 'Board sent its first reading' end);
  elsif gap > interval '30 seconds' then
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
    elsif p_state = 'stopped' and prev = 'restarting' then
      -- still the same stop: note on the back in range line that the restart was called off
      select id, at into back from public.events
      where device_id = d.id and kind = 'back_in_range' and ended_at is null order by at desc limit 1;
      if found then
        update public.events set ended_at = now(),
          detail = format('%s. Out of range again after %s s, so the pump stays off', split_part(detail, '. ', 1),
                          greatest(1, round(extract(epoch from now() - back.at))))
        where id = back.id;
      end if;
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
      update public.events set ended_at = now() where device_id = d.id and kind in ('stopped', 'back_in_range') and ended_at is null;
      insert into public.events (device_id, kind, ph, ntu, detail)
      values (d.id, 'restarted', p_ph, p_ntu, format('After %s s back in range', d.restart_s));
    end if;
  end if;

  update public.devices set last_seen_at = now(), last_ph = p_ph, last_ntu = p_ntu, last_ph_v = p_ph_v,
    last_ntu_v = p_ntu_v, pump_on = p_pump_on, state = p_state, last_source = p_source,
    -- a new state, or a board coming back after a gap, starts the clock again
    state_since = case when p_state <> prev or d.state_since is null or gap > interval '30 seconds' then now()
                       else d.state_since end
  where id = d.id;
end $$;
revoke all on function public.record_reading from public, anon, authenticated;

-- The same rules as the firmware: confirm for confirm_s before stopping, restart only after restart_s in range.
create function public.next_state(d public.devices, p_out boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  s text := coalesce(d.state, 'safe');
  since timestamptz := case when d.last_seen_at is null or d.last_seen_at < now() - interval '30 seconds'
                            then now() else coalesce(d.state_since, now()) end;
begin
  if s = 'safe' then
    return case when p_out then 'checking' else 'safe' end;
  elsif s = 'checking' then
    if not p_out then return 'safe'; end if;
    return case when now() - since >= make_interval(secs => d.confirm_s) then 'stopped' else 'checking' end;
  elsif s = 'stopped' then
    return case when p_out then 'stopped' else 'restarting' end;
  end if;
  if p_out then return 'stopped'; end if;
  return case when now() - since >= make_interval(secs => d.restart_s) then 'safe' else 'restarting' end;
end $$;
revoke all on function public.next_state from public, anon, authenticated;

-- One tick of the virtual board: the next simulated reading drifts toward clean water, or toward the poured
-- sample while it lasts, with the sensor voltages the real board would report from its calibration.
create function public.tick_virtual(p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.devices;
  f text;
  k float8;
  ph0 float8;
  l float8;
  ph numeric;
  ntu numeric;
  st text;
  disc float8;
  ph_v numeric;
  ntu_v numeric;
begin
  select * into d from public.devices where id = p_device and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  if d.last_source = 'board' and d.last_seen_at > now() - interval '1 minute' then
    raise exception 'the real board is online, so the virtual board stays off';
  end if;
  -- several tabs or visitors share one virtual board: a tick inside 1.5 s of the last one is skipped
  if d.last_seen_at > now() - interval '1500 milliseconds' then
    return jsonb_build_object('ok', false);
  end if;

  f := case when d.sim_fault_until > now() then d.sim_fault end;
  k := case when f is null then 0.22 else 0.4 end;
  ph0 := coalesce(d.last_ph, 7.2);
  ph := round(least(14, greatest(0, ph0 + ((case when f = 'ph' then d.ph_max + 0.5 else 7.2 end) - ph0) * k
                                     + (random() - 0.5) * 0.05))::numeric, 2);
  l := log(greatest(0.1, coalesce(d.last_ntu, 1.7))::float8);
  ntu := round(least(3000, power(10, l + (log((case when f = 'ntu' then greatest(30, d.ntu_max * 6) else 1.7 end)::float8) - l) * k
                                     + (random() - 0.5) * 0.04))::numeric, 1);

  st := public.next_state(d, public.out_reason(d, ph, ntu) is not null);

  ph_v := round((ph - d.ph_offset) / d.ph_slope, 3);
  -- invert NTU = -1120.4 V^2 + 5742.3 V - 4352.9 on its falling side (2.5 to 4.2 V), then undo the clear water shift
  disc := 5742.3 ^ 2 - 4 * 1120.4 * (4352.9 + least(ntu, 3000));
  ntu_v := round(greatest(0, least(4.2, case when disc > 0 then (5742.3 + sqrt(disc)) / (2 * 1120.4) else 2.5 end)
                             - (4.2 - d.clear_volt))::numeric, 3);

  perform public.record_reading(d, ph, ntu, st in ('safe', 'checking'), st, ph_v, ntu_v, 'virtual');
  select * into d from public.devices where id = p_device;
  return jsonb_build_object('ok', true, 'last_ph', d.last_ph, 'last_ntu', d.last_ntu, 'last_ph_v', d.last_ph_v,
    'last_ntu_v', d.last_ntu_v, 'state', d.state, 'state_since', d.state_since, 'pump_on', d.pump_on,
    'last_source', d.last_source, 'last_seen_at', d.last_seen_at, 'sim_fault', d.sim_fault,
    'sim_fault_until', d.sim_fault_until);
end $$;
grant execute on function public.tick_virtual to authenticated;

-- Pour a sample into the virtual board: it pushes the readings for 20 s, then the water clears.
create function public.pour_virtual(p_device uuid, p_kind text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare until timestamptz := now() + interval '20 seconds';
begin
  if p_kind not in ('ph', 'ntu') then raise exception 'unknown sample %', p_kind; end if;
  update public.devices set sim_fault = p_kind, sim_fault_until = until
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  return until;
end $$;
grant execute on function public.pour_virtual to authenticated;

-- The browser no longer sends its own simulated readings.
drop function public.ingest_virtual(uuid, numeric, numeric, boolean, text, numeric, numeric);

-- Simulated history, unchanged except that a stop left open when the virtual board last ran now ends
-- with a restart (or a check with a false alarm) where the gap starts, so the record never jumps.
create or replace function public.fill_virtual_history(p_device uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  d public.devices;
  t0 timestamptz;
  t1 timestamptz := now() - interval '3 seconds';
  sp jsonb;
  r record;
  why text;
  back_ph numeric;
  back_ntu numeric;
  added int;
begin
  select * into d from public.devices where id = p_device and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  if exists (select 1 from public.readings where device_id = p_device and source = 'board') then return 0; end if;
  if d.last_seen_at is not null and d.last_seen_at > now() - interval '30 seconds' then return 0; end if;

  delete from public.readings where device_id = p_device and at < now() - interval '35 days';
  t0 := greatest(coalesce(d.last_seen_at, now() - interval '30 days'), now() - interval '30 days');

  -- incidents: when the pump stopped, what caused it, the worst value, minutes the pump was off
  sp := jsonb_build_array(
    jsonb_build_object('s', date_trunc('minute', now() - interval '20 hours 10 minutes'), 'kind', 'ph_high',
                       'peak', greatest(9.02, d.ph_max + 0.12), 'off', 9),
    jsonb_build_object('s', date_trunc('minute', now() - interval '3 days 6 hours 25 minutes'), 'kind', 'ntu_high',
                       'peak', greatest(7.8, d.ntu_max + 1.6), 'off', 14),
    jsonb_build_object('s', date_trunc('minute', now() - interval '11 days 2 hours 40 minutes'), 'kind', 'ph_low',
                       'peak', least(6.21, d.ph_min - 0.12), 'off', 6),
    jsonb_build_object('s', date_trunc('minute', now() - interval '23 days 15 hours 5 minutes'), 'kind', 'ph_high',
                       'peak', greatest(8.84, d.ph_max + 0.12), 'off', 5));

  -- anything left open when the virtual board last ran ends where the gap starts
  if exists (select 1 from public.events where device_id = p_device and kind = 'stopped' and ended_at is null) then
    insert into public.events (device_id, at, kind, ph, ntu, detail)
    values (p_device, t0, 'restarted', d.last_ph, d.last_ntu, 'The simulated water cleared while this page was closed');
  elsif exists (select 1 from public.events where device_id = p_device and kind = 'checking' and ended_at is null) then
    insert into public.events (device_id, at, kind, ph, ntu, detail)
    values (p_device, t0, 'false_alarm', d.last_ph, d.last_ntu, 'Back in range before it was confirmed. The pump kept running');
  end if;
  update public.events set ended_at = t0
  where device_id = p_device and kind in ('checking', 'stopped', 'back_in_range') and ended_at is null;

  insert into public.readings (device_id, at, ph, ntu, pump_on, state, source)
  select p_device, v.at,
    round((case
      when v.phase = 'rise' and v.kind = 'ph_high' then 8.1 + random() * 0.2
      when v.phase = 'rise' and v.kind = 'ph_low' then 6.62 + random() * 0.1
      when v.phase = 'out' and v.kind = 'ph_high' then v.peak - random() * 0.06
      when v.phase = 'out' and v.kind = 'ph_low' then v.peak + random() * 0.06
      when v.phase = 'restarting' and v.kind = 'ph_low' then 6.9 + random() * 0.05
      when v.phase = 'restarting' and v.kind = 'ph_high' then 7.55 + random() * 0.1
      else 7.2 + 0.14 * sin(extract(epoch from v.at)::float8 / 7200.0) + (random() - 0.5) * 0.08 end)::numeric, 2),
    round((case
      when v.kind = 'ntu_high' and v.phase = 'rise' then 3.9 + random() * 0.6
      when v.kind = 'ntu_high' and v.phase = 'out' then v.peak - random() * 0.5
      when v.kind = 'ntu_high' and v.phase = 'restarting' then 3.2 + random() * 0.3
      else 1.7 + 0.45 * sin(extract(epoch from v.at)::float8 / 9900.0 + 1) + random() * 0.35 end)::numeric, 1),
    v.phase not in ('out', 'restarting'),
    case v.phase when 'out' then 'stopped' when 'restarting' then 'restarting' else 'safe' end,
    'virtual'
  from (
    select g.at, x.kind, x.peak,
      case when x.s is null then 'base'
           when g.at < x.s then 'rise'
           when g.at < x.s + make_interval(mins => x.off) - make_interval(secs => d.restart_s) then 'out'
           else 'restarting' end as phase
    from generate_series(date_trunc('minute', t0) + interval '1 minute', t1, interval '1 minute') as g(at)
    left join jsonb_to_recordset(sp) as x(s timestamptz, kind text, peak numeric, off int)
      on g.at >= x.s - interval '2 minutes' and g.at < x.s + make_interval(mins => x.off)
    where g.at >= now() - interval '24 hours' or extract(minute from g.at)::int % 10 = 0 or x.s is not null
  ) v;
  get diagnostics added = row_count;

  for r in select * from jsonb_to_recordset(sp) as x(s timestamptz, kind text, peak numeric, off int)
           where x.s - interval '2 minutes' > t0 and x.s + make_interval(mins => x.off) < t1 loop
    why := case r.kind
      when 'ph_high' then format('pH %s is above the %s limit', round(r.peak, 2), trim_scale(d.ph_max))
      when 'ph_low' then format('pH %s is below the %s limit', round(r.peak, 2), trim_scale(d.ph_min))
      else format('Turbidity %s NTU is above the %s NTU limit', round(r.peak, 1), trim_scale(d.ntu_max)) end;
    back_ph := case r.kind when 'ph_low' then 6.92 else 7.6 end;
    back_ntu := case r.kind when 'ntu_high' then 3.3 else 2.6 end;
    insert into public.events (device_id, at, kind, ph, ntu, detail, ended_at) values
      (p_device, r.s - make_interval(secs => d.confirm_s), 'checking',
       case when r.kind = 'ntu_high' then 7.2 else round(r.peak, 2) end, case when r.kind = 'ntu_high' then round(r.peak, 1) else 2.4 end,
       why || format(', confirming for %s s', d.confirm_s), r.s),
      (p_device, r.s, 'stopped',
       case when r.kind = 'ntu_high' then 7.2 else round(r.peak, 2) end, case when r.kind = 'ntu_high' then round(r.peak, 1) else 2.4 end,
       why, r.s + make_interval(mins => r.off)),
      (p_device, r.s + make_interval(mins => r.off) - make_interval(secs => d.restart_s), 'back_in_range', back_ph, back_ntu,
       format('pH %s, %s NTU. Restarting after %s s in range', back_ph, back_ntu, d.restart_s), r.s + make_interval(mins => r.off)),
      (p_device, r.s + make_interval(mins => r.off), 'restarted', back_ph, back_ntu,
       format('After %s s back in range', d.restart_s), null);
  end loop;

  if d.last_seen_at is null then
    insert into public.events (device_id, at, kind, detail) values (p_device, t0, 'connected', 'Virtual board sent its first reading');
  end if;

  update public.devices set last_seen_at = t1, last_source = 'virtual', pump_on = true, state = 'safe', state_since = t1,
    sim_fault = null, sim_fault_until = null,
    last_ph = (select ph from public.readings where device_id = p_device order by at desc limit 1),
    last_ntu = (select ntu from public.readings where device_id = p_device order by at desc limit 1)
  where id = p_device;
  return added;
end $$;

-- Summary numbers for a window. The in range share is weighted by time: each reading counts until the next
-- one (at most 11 min, so a long offline gap counts for nothing), because simulated history is stored one
-- reading a minute or every 10 minutes while live readings come every 2 s. board_n says how many came from
-- the real board, so a test run can say what it was tested on.
drop function public.reading_stats(uuid, timestamptz, timestamptz);
create function public.reading_stats(p_device uuid, p_from timestamptz, p_to timestamptz default now())
returns table (n bigint, ph_min numeric, ph_avg numeric, ph_max numeric, ntu_min numeric, ntu_avg numeric,
               ntu_max numeric, in_range_pct numeric, board_n bigint)
language sql stable security invoker set search_path = '' as $$
  with w as (
    select r.ph, r.ntu, r.source,
      r.ph between d.ph_min and d.ph_max and r.ntu <= d.ntu_max as ok,
      least(660, extract(epoch from coalesce(lead(r.at) over (order by r.at), least(r.at + interval '2 seconds', p_to)) - r.at)) as dt
    from public.readings r join public.devices d on d.id = r.device_id
    where r.device_id = p_device and r.at >= p_from and r.at <= p_to
  )
  select count(*), min(ph), round(avg(ph), 2), max(ph), min(ntu), round(avg(ntu), 1), max(ntu),
    round(100.0 * coalesce(sum(dt) filter (where ok), 0) / nullif(sum(dt), 0), 1),
    count(*) filter (where source = 'board')
  from w
  having count(*) > 0
$$;
grant execute on function public.reading_stats to authenticated;
