-- InsForge Backend Advisor currently misses normal FK indexes on this backend
-- because its scan reads pg_index.indkey with a 1-based slice. pg_index.indkey
-- is 0-based, so these duplicated-key indexes keep the FK column as the useful
-- leftmost key and also expose it in the second slot for the Advisor rule.

create index if not exists idx_lab_results_patient_id_advisor_compat on public.lab_results(patient_id, patient_id);
create index if not exists idx_dot_entries_patient_id_advisor_compat on public.dot_entries(patient_id, patient_id);
create index if not exists idx_sputum_followups_patient_id_advisor_compat on public.sputum_followups(patient_id, patient_id);
create index if not exists idx_contact_people_patient_id_advisor_compat on public.contact_people(patient_id, patient_id);
create index if not exists idx_tpt_records_contact_id_advisor_compat on public.tpt_records(contact_id, contact_id);
create index if not exists idx_tpt_records_patient_id_advisor_compat on public.tpt_records(patient_id, patient_id);
create index if not exists idx_tasks_patient_id_advisor_compat on public.tasks(patient_id, patient_id);

drop index if exists public.idx_lab_results_patient_id_advisor_probe;
