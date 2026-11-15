-- Applied to the SELF-AUDIT Supabase project (yxqimxadxmtuwinqyzbh), not to the sub-dealer project.
-- Purely additive: one small secret table and one read-only function. Nothing existing is changed.
--
-- The Sub-Dealer Warranty Desk calls sub_dealer_scrap_status() to learn whether the claims in a defected-parts
-- return can be scrapped yet. The rule is the same one run_generate_scrap_requests_all() uses to flag claims:
--   Verification Date more than 90 days ago (91+ days), claim status Approved / Settled / To Be Settled,
--   the claim has parts, and its parts are not reserved for / handed to the supplier.
--
-- NOTE: the self-audit API refuses anonymous calls (public.view_only_guard is not executable by anon), so the portal
-- calls this function with the service role. The connection settings are in the portal's integration_secrets table.

create table if not exists public.portal_link_secret (
  id integer primary key default 1 check (id = 1),
  secret text not null
);
alter table public.portal_link_secret enable row level security; -- no policies: only the function below can read it

insert into public.portal_link_secret (id, secret)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- p_items: [{ "key": "...", "work_order_no": "HER-36167", "vin": "LSJ...", "twins": 1, "part_no": "optional" }, ...]
--   twins = how many portal claims share this exact work order + VIN (more than one makes the match ambiguous)
-- returns: [{ "key", "status", "verification_date", "eligible_on", "days_held", "batch_claim_number", "batch_status" }, ...]
-- status: can_scrap | already_scrapped | not_yet | not_verified | reserved | no_parts | not_found | ambiguous
create or replace function public.sub_dealer_scrap_status(p_secret text, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_wo text;
  v_base text;
  v_vin text;
  v_part text;
  v_twins integer;
  v_exact integer;
  v_total integer;
  v_claim_id uuid;
  v_claim_number text;
  v_batch_status text;
  v_verif date;
  v_has_parts boolean;
  v_status text;
begin
  select secret into v_secret from portal_link_secret where id = 1;
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'not allowed';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    raise exception 'bad request';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_wo := upper(trim(coalesce(v_item->>'work_order_no', '')));
    v_vin := upper(trim(coalesce(v_item->>'vin', '')));
    v_part := upper(trim(coalesce(v_item->>'part_no', '')));
    v_twins := coalesce(nullif(v_item->>'twins', '')::integer, 1);
    -- HER-36167-1 and HER-36167 are the same work order: a "-1" only marks one more claim on it
    v_base := regexp_replace(v_wo, '^([A-Z]+-[0-9]+)-[0-9]+$', '\1');

    v_claim_id := null; v_claim_number := null; v_batch_status := null; v_verif := null; v_has_parts := null;

    -- batch claims on this VIN (indexed) with the same base work order
    select count(*) filter (where upper(c.work_order_no) = v_wo), count(*)
      into v_exact, v_total
    from self_audit_claims c
    where c.vin = v_vin
      and regexp_replace(upper(c.work_order_no), '^([A-Z]+-[0-9]+)-[0-9]+$', '\1') = v_base;

    if v_total = 0 then
      v_status := 'not_found';
    elsif (case when v_exact > 0 then v_exact else v_total end) > 1
          or (v_twins > 1 and v_total > 1) then
      -- more than one batch claim could be this one, or two portal claims share the work order: do not guess
      v_status := 'ambiguous';
    else
      select c.id, c.claim_number, s.status, s.verification_date, s.has_parts
        into v_claim_id, v_claim_number, v_batch_status, v_verif, v_has_parts
      from self_audit_claims c
      left join self_audit_claim_settlement s on s.claim_id = c.id
      where c.vin = v_vin
        and regexp_replace(upper(c.work_order_no), '^([A-Z]+-[0-9]+)-[0-9]+$', '\1') = v_base
        and (v_exact = 0 or upper(c.work_order_no) = v_wo)
      limit 1;

      if v_verif is null or lower(coalesce(v_batch_status, '')) not in ('approved', 'settled', 'to be settled') then
        v_status := 'not_verified';
      elsif exists (select 1 from self_audit_scrapped_parts sp where sp.claim_id = v_claim_id)
         or exists (select 1 from self_audit_scrap_requests sr where sr.claim_id = v_claim_id and sr.status = 'scrapped') then
        v_status := 'already_scrapped';
      elsif exists (
          select 1 from self_audit_supplier_collection_parts scp
          join self_audit_supplier_collections sc on sc.id = scp.collection_id
          where scp.claim_id = v_claim_id
            and (sc.status = 'handed_over'
                 or (sc.status = 'pending' and (sc.collection_date is null or sc.collection_date >= current_date)
                     and (v_part = '' or upper(trim(scp.part_no)) = v_part)))
        ) then
        v_status := 'reserved';
      elsif coalesce(v_has_parts, false) = false then
        v_status := 'no_parts';
      elsif v_verif < current_date - 90 then
        v_status := 'can_scrap';
      else
        v_status := 'not_yet';
      end if;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', v_item->>'key',
      'status', v_status,
      'verification_date', v_verif,
      'eligible_on', case when v_verif is not null then v_verif + 91 end,
      'days_held', case when v_verif is not null then current_date - v_verif end,
      'batch_claim_number', v_claim_number,
      'batch_status', v_batch_status
    ));
  end loop;

  return v_out;
end;
$$;

-- Only the sub-dealer portal's server calls it, with the service role.
revoke all on function public.sub_dealer_scrap_status(text, jsonb) from public;
revoke execute on function public.sub_dealer_scrap_status(text, jsonb) from anon, authenticated;
grant execute on function public.sub_dealer_scrap_status(text, jsonb) to service_role;
