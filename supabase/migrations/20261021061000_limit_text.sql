-- Limits read as people write them (8.5, not 8.50) in alerts and the record.

create or replace function public.out_reason(d public.devices, p_ph numeric, p_ntu numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_ph > d.ph_max then format('pH %s is above the %s limit', p_ph, trim_scale(d.ph_max))
    when p_ph < d.ph_min then format('pH %s is below the %s limit', p_ph, trim_scale(d.ph_min))
    when p_ntu > d.ntu_max then format('Turbidity %s NTU is above the %s NTU limit', p_ntu, trim_scale(d.ntu_max))
    else null end
$$;

create or replace function public.set_limits(p_device uuid, p_ph_min numeric, p_ph_max numeric, p_ntu_max numeric,
  p_confirm_s int, p_restart_s int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.devices set ph_min = p_ph_min, ph_max = p_ph_max, ntu_max = p_ntu_max,
    confirm_s = p_confirm_s, restart_s = p_restart_s
  where id = p_device and owner_id = (select auth.uid());
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  insert into public.events (device_id, kind, detail)
  values (p_device, 'limits_changed', format('Safe range set to pH %s to %s, turbidity up to %s NTU. Confirm %s s, restart %s s',
          trim_scale(p_ph_min), trim_scale(p_ph_max), trim_scale(p_ntu_max), p_confirm_s, p_restart_s));
end $$;

create or replace function public.fill_virtual_history(p_device uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  d public.devices;
  t0 timestamptz;
  t1 timestamptz;
  first_at timestamptz;
  idle boolean;
  spike timestamptz := date_trunc('minute', now() - interval '20 hours 10 minutes');
  added int;
begin
  select * into d from public.devices where id = p_device and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'not your device' using errcode = '42501'; end if;
  if exists (select 1 from public.readings where device_id = p_device and source = 'board') then return 0; end if;

  select min(at) into first_at from public.readings where device_id = p_device;
  idle := d.last_seen_at is null or d.last_seen_at < now() - interval '2 hours';
  if idle then
    t0 := greatest(coalesce(d.last_seen_at, now() - interval '24 hours'), now() - interval '24 hours');
    t1 := now() - interval '30 seconds';
  elsif first_at > now() - interval '2 hours' then
    t0 := now() - interval '24 hours';
    t1 := first_at - interval '1 minute';
  else
    return 0;
  end if;

  insert into public.readings (device_id, at, ph, ntu, pump_on, state, source)
  select p_device, g.at,
    round((case
      when g.at >= spike - interval '2 minutes' and g.at < spike then 8.1 + random() * 0.2
      when g.at >= spike and g.at < spike + interval '8 minutes' then 8.95 + random() * 0.08
      else 7.2 + 0.14 * sin(extract(epoch from g.at)::float8 / 7200.0) + (random() - 0.5) * 0.08 end)::numeric, 2),
    round((1.7 + 0.45 * sin(extract(epoch from g.at)::float8 / 9900.0 + 1) + random() * 0.35)::numeric, 1),
    not (g.at >= spike and g.at < spike + interval '9 minutes'),
    case when g.at >= spike and g.at < spike + interval '8 minutes' then 'stopped'
         when g.at >= spike + interval '8 minutes' and g.at < spike + interval '9 minutes' then 'restarting'
         else 'safe' end,
    'virtual'
  from generate_series(date_trunc('minute', t0) + interval '1 minute', t1, interval '1 minute') as g(at);
  get diagnostics added = row_count;

  if spike > t0 and spike + interval '9 minutes' < t1 then
    insert into public.events (device_id, at, kind, ph, ntu, detail, ended_at) values
      (p_device, spike - interval '2 seconds', 'checking', 8.92, 2.4, format('pH 8.92 is above the %s limit, confirming for %s s', trim_scale(d.ph_max), d.confirm_s), spike),
      (p_device, spike, 'stopped', 9.02, 3.1, format('pH 9.02 is above the %s limit', trim_scale(d.ph_max)), spike + interval '9 minutes'),
      (p_device, spike + interval '8 minutes 30 seconds', 'back_in_range', 7.6, 2.6, format('pH 7.60, 2.6 NTU. Restarting after %s s in range', d.restart_s), null),
      (p_device, spike + interval '9 minutes', 'restarted', 7.48, 2.2, format('After %s s back in range', d.restart_s), null);
  end if;

  if idle then
    update public.devices set last_seen_at = now() - interval '30 seconds', last_source = 'virtual',
      last_ph = coalesce(last_ph, 7.21), last_ntu = coalesce(last_ntu, 1.8), pump_on = true, state = 'safe'
    where id = p_device;
  end if;
  return added;
end $$;
