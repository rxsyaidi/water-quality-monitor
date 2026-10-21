-- An open test run can be discarded by its owner. Finished runs stay, so a demo visitor
-- cannot wipe the recorded results.
create policy "own test runs: discard open" on public.test_runs for delete to authenticated
  using (public.owns(device_id) and ended_at is null);
grant delete on public.test_runs to authenticated;
