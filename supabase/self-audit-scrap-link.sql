-- Applied to the SELF-AUDIT Supabase project (yxqimxadxmtuwinqyzbh), not to the sub-dealer project.
-- Purely additive: one small secret table and one read-only function. Nothing existing is changed.
--
-- The Sub-Dealer Warranty Desk calls sub_dealer_scrap_status() to learn whether the claims in a defected-parts
-- return can be scrapped yet. The rule is the same one run_generate_scrap_requests_all() uses to flag claims:
--   Verification Date more than 90 days ago (91+ days), claim status Approved / Settled / To Be Settled,
--   the claim has parts, and its parts are not reserved for / handed to the supplier.
--
-- Matching: when the portal claim has its GWS claim ID (WSA...) that names the batch claim exactly. Otherwise a portal
-- claim is matched by VIN and dealer work order. A suffix (-1, -2) only says the work order has more than one claim,
-- not which claim is which, so it is ignored; when several batch claims share the work order and VIN, the one holding
-- the same part numbers is the match.
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

-- p_items: [{ "key": "...", "work_order_no": "HER-36167", "vin": "LSJ...", "gws_claim_id": "WSA...", "part_nos": ["10632434", ...] }, ...]
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
  v_gws text;
  v_parts text[];
  v_ids uuid[];
  v_hits uuid[];
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
    v_gws := upper(trim(coalesce(v_item->>'gws_claim_id', '')));
    -- the part numbers of the portal claim: the data used to tell claims on the same work order apart
    select coalesce(array_agg(distinct upper(btrim(x))) filter (where btrim(x) <> ''), '{}')
      into v_parts
    from jsonb_array_elements_text(case when jsonb_typeof(v_item->'part_nos') = 'array' then v_item->'part_nos' else '[]'::jsonb end) x;
    -- HER-36167-1 and HER-36167 share one work order; the suffix only says there is more than one claim on it
    v_base := regexp_replace(v_wo, '^([A-Z]+-[0-9]+)-[0-9]+$', '\1');

    v_claim_id := null; v_claim_number := null; v_batch_status := null; v_verif := null; v_has_parts := null;

    if v_gws <> '' then
      -- the GWS claim ID names the batch claim exactly
      select array_agg(c.id) into v_ids from self_audit_claims c where c.claim_number = v_gws;
    else
      -- no GWS ID yet: VIN (indexed) and work order, suffix ignored
      select array_agg(c.id) into v_ids
      from self_audit_claims c
      where c.vin = v_vin
        and regexp_replace(upper(c.work_order_no), '^([A-Z]+-[0-9]+)-[0-9]+$', '\1') = v_base;
    end if;

    if v_ids is null then
      v_status := 'not_found';
    else
      if array_length(v_ids, 1) = 1 then
        v_claim_id := v_ids[1];
      elsif v_gws = '' then
        -- several claims share the work order: pick the one holding the same parts (lookups limited to those claims,
        -- so the API's 8 second statement timeout is never hit)
        select array_agg(distinct hit) into v_hits from (
          select cp.claim_id as hit from self_audit_claim_parts cp
            where cp.claim_id = any(v_ids) and upper(btrim(cp.part_no)) = any(v_parts)
          union
          select c.id from self_audit_claims c
            where c.id = any(v_ids)
              and (upper(btrim(c.raw_row->>'Main Part')) = any(v_parts)
                   or exists (
                     select 1 from unnest(string_to_array(regexp_replace(coalesce(c.raw_row->>'Part No', ''), '^#', ''), ';')) pn
                     where upper(btrim(pn)) = any(v_parts)))
        ) h;
        if v_hits is not null and array_length(v_hits, 1) = 1 then
          v_claim_id := v_hits[1];
        end if;
      end if;

      if v_claim_id is null then
        v_status := 'ambiguous';
      else
        select c.claim_number, s.status, s.verification_date, s.has_parts
          into v_claim_number, v_batch_status, v_verif, v_has_parts
        from self_audit_claims c
        left join self_audit_claim_settlement s on s.claim_id = c.id
        where c.id = v_claim_id;

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

-- ---------------------------------------------------------------------------------------------------------------------
-- Revenue window (applied later, same project, same pattern: read-only, service role only, checks portal_link_secret).
-- ---------------------------------------------------------------------------------------------------------------------
-- sub_dealer_free_service_invoiced(p_secret, p_items): items [{ key, work_order_no: "HER-42678", vin }] ->
--   [{ key, invoiced, lines }]: the sum of self_audit_invoicing_detail lines in account I660 (I0000660: free service for the
--   customer; labor KH9 + parts MG5) with branch = dealer code of the work order prefix (HER = A7 ...), wip = the work order
--   number and the same VIN. invoiced is null when there is no such line yet.
-- sub_dealer_warranty_parts(p_secret, p_items): items [{ key, gws_claim_id, work_order_no, vin }] ->
--   [{ key, batch_found, batch_parts, batch_status, invoiced_parts, invoiced_lines }]: batch_parts = the claims batch's
--   "Adjusted Part TOL." x 3.75 (USD -> SAR) of the claim with the same GWS claim ID, VIN and work order (suffix ignored);
--   invoiced_parts = parts lines under account W40 (W0000040) with the same GWS claim number, VIN and work order (WIP).
-- The full SQL of both functions is in the project's migration history: sub_dealer_free_service_invoiced and
-- sub_dealer_warranty_parts (+ sub_dealer_warranty_parts_w40_only).
