-- cap_rows read new.owner_id on test_runs too (PL/pgSQL does not short-circuit "and"), which broke
-- starting a run. One trigger function per table.
create or replace function public.cap_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'devices' then
    if (select count(*) from public.devices where owner_id = new.owner_id) >= 3 then
      raise exception 'one account can have up to 3 tanks';
    end if;
  elsif tg_table_name = 'test_runs' then
    if (select count(*) from public.test_runs where device_id = new.device_id) >= 200 then
      raise exception 'this tank already has 200 test runs';
    end if;
  end if;
  return new;
end $$;
