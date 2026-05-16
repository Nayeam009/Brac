alter function public.tb_fo_is_admin() set search_path = '';
alter function public.tb_fo_can_access_patient(text) set search_path = '';
alter function public.tb_fo_is_active_role(text[]) set search_path = '';
alter function public.tb_fo_is_active_field_officer() set search_path = '';

revoke execute on function public.tb_fo_is_admin() from public;
revoke execute on function public.tb_fo_can_access_patient(text) from public;
revoke execute on function public.tb_fo_is_active_role(text[]) from public;
revoke execute on function public.tb_fo_is_active_field_officer() from public;

grant execute on function public.tb_fo_is_admin() to authenticated;
grant execute on function public.tb_fo_can_access_patient(text) to authenticated;
grant execute on function public.tb_fo_is_active_role(text[]) to authenticated;
grant execute on function public.tb_fo_is_active_field_officer() to authenticated;

drop policy if exists project_admin_policy on public.app_settings;
drop policy if exists project_admin_policy on public.contact_people;
drop policy if exists project_admin_policy on public.diary_entries;
drop policy if exists project_admin_policy on public.dot_entries;
drop policy if exists project_admin_policy on public.field_officer_areas;
drop policy if exists project_admin_policy on public.lab_results;
drop policy if exists project_admin_policy on public.patients;
drop policy if exists project_admin_policy on public.profiles;
drop policy if exists project_admin_policy on public.providers;
drop policy if exists project_admin_policy on public.record_attachments;
drop policy if exists project_admin_policy on public.report_exports;
drop policy if exists project_admin_policy on public.sputum_followups;
drop policy if exists project_admin_policy on public.tasks;
drop policy if exists project_admin_policy on public.tpt_records;

create index if not exists idx_lab_results_patient_id on public.lab_results(patient_id);
create index if not exists idx_dot_entries_patient_id on public.dot_entries(patient_id);
create index if not exists idx_sputum_followups_patient_id on public.sputum_followups(patient_id);
create index if not exists idx_contact_people_patient_id on public.contact_people(patient_id);
create index if not exists idx_tpt_records_contact_id on public.tpt_records(contact_id);
create index if not exists idx_tpt_records_patient_id on public.tpt_records(patient_id);
create index if not exists idx_tasks_patient_id on public.tasks(patient_id);
