alter function public.tb_fo_is_active_field_officer() security invoker;
alter function public.tb_fo_is_active_role(text[]) security invoker;
alter function public.tb_fo_is_admin() security invoker;
alter function public.tb_fo_can_access_patient(text) security invoker;

grant execute on function public.tb_fo_is_active_field_officer() to authenticated;
grant execute on function public.tb_fo_is_active_role(text[]) to authenticated;
grant execute on function public.tb_fo_is_admin() to authenticated;
grant execute on function public.tb_fo_can_access_patient(text) to authenticated;

create index if not exists idx_lab_results_patient_id on public.lab_results(patient_id);
create index if not exists idx_dot_entries_patient_id on public.dot_entries(patient_id);
create index if not exists idx_sputum_followups_patient_id on public.sputum_followups(patient_id);
create index if not exists idx_contact_people_patient_id on public.contact_people(patient_id);
create index if not exists idx_tpt_records_contact_id on public.tpt_records(contact_id);
create index if not exists idx_tpt_records_patient_id on public.tpt_records(patient_id);
create index if not exists idx_tasks_patient_id on public.tasks(patient_id);

drop policy if exists field_officer_areas_insert_active_fo on public.field_officer_areas;
create policy field_officer_areas_insert_active_fo on public.field_officer_areas
  for insert to authenticated
  with check (public.tb_fo_is_active_field_officer());

drop policy if exists field_officer_areas_update_active_fo on public.field_officer_areas;
create policy field_officer_areas_update_active_fo on public.field_officer_areas
  for update to authenticated
  using (public.tb_fo_is_active_field_officer())
  with check (public.tb_fo_is_active_field_officer());

drop policy if exists field_officer_areas_delete_active_fo on public.field_officer_areas;
create policy field_officer_areas_delete_active_fo on public.field_officer_areas
  for delete to authenticated
  using (public.tb_fo_is_active_field_officer());
