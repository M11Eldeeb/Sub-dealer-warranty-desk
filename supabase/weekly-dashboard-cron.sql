-- The weekly dashboard e-mail: every Wednesday at 07:00 UTC (10:00 AM Saudi time) the database scheduler calls the site,
-- which makes the interactive dashboard file and e-mails it to the "Weekly dashboard" recipients in Settings.
-- Same shape as run_daily_reminders(): the shared secret in cron_secret authorizes the call.
create or replace function public.run_weekly_dashboard()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s text;
  req bigint;
begin
  select secret into s from public.cron_secret where id = 1;
  select net.http_get(
    url := 'https://sub-dealer-warranty-desk.vercel.app/api/cron/weekly-dashboard',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s),
    timeout_milliseconds := 60000
  ) into req;
  return req;
end;
$$;

select cron.schedule('weekly-dashboard', '0 7 * * 3', 'select public.run_weekly_dashboard()');
