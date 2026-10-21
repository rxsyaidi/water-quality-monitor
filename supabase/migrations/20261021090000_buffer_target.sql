-- The simulated pH sample is the pH 9.18 buffer the bench tests use, so the button, the Test runs preset
-- and the readings all name the same sample. It was aimed at the upper limit plus 0.5 before.
create or replace function public.tick_virtual(p_device uuid) returns jsonb
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
  ph := round(least(14, greatest(0, ph0 + ((case when f = 'ph' then 9.18 else 7.2 end) - ph0) * k
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
