-- The app treats a board as offline after 30 s without a reading, so the record does the same.
-- fill_virtual_history now keeps a 30 day simulated record (one reading a minute for the last day, one every
-- 10 minutes before that, finer around each incident), with four incidents, and fills any gap over 30 s
-- since the virtual board last ran. Virtual readings older than 35 days are dropped.

create or replace function public.record_reading(d public.devices, p_ph numeric, p_ntu numeric, p_pump_on boolean,
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
       format('pH %s, %s NTU. Restarting after %s s in range', back_ph, back_ntu, d.restart_s), null),
      (p_device, r.s + make_interval(mins => r.off), 'restarted', back_ph, back_ntu,
       format('After %s s back in range', d.restart_s), null);
  end loop;

  if d.last_seen_at is null then
    insert into public.events (device_id, at, kind, detail) values (p_device, t0, 'connected', 'Virtual board sent its first reading');
  end if;
  -- anything left open when the virtual board last stopped ends where the gap starts
  update public.events set ended_at = t0 where device_id = p_device and kind in ('checking', 'stopped') and ended_at is null;

  update public.devices set last_seen_at = t1, last_source = 'virtual', pump_on = true, state = 'safe',
    last_ph = (select ph from public.readings where device_id = p_device order by at desc limit 1),
    last_ntu = (select ntu from public.readings where device_id = p_device order by at desc limit 1)
  where id = p_device;
  return added;
end $$;
