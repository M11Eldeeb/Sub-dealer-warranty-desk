-- The parts team attaches the waybill as well as the part requisition before marking a part "Supplied to Sub-Dealer".
-- New attachment stage 'part_waybill', and the parts team may add files of either stage (same claim statuses as before).
alter table public.claim_attachments drop constraint claim_attachments_stage_check;
alter table public.claim_attachments add constraint claim_attachments_stage_check
  check (stage = any (array['evidence_before', 'after_repair', 'part_requisition', 'part_waybill']));

drop policy "parts_team insert requisition attachments" on public.claim_attachments;
create policy "parts_team insert requisition attachments" on public.claim_attachments for insert
  with check (
    my_role() = 'parts_team'
    and stage in ('part_requisition', 'part_waybill')
    and exists (
      select 1 from public.claims c
      where c.id = claim_attachments.claim_id
        and c.status = any (array['awaiting_parts', 'parts_arrived', 'parts_return'])
    )
  );
