create extension if not exists pgcrypto;

alter table profiles drop constraint if exists profiles_role_check;
update profiles
set role = 'fo',
    status = case when status = 'blocked' then 'blocked' else 'active' end,
    updated_at = now()
where role <> 'fo' or status = 'pending';
alter table profiles alter column role set default 'fo';
alter table profiles alter column status set default 'active';
alter table profiles add constraint profiles_role_check check (role = 'fo');

create or replace function tb_fo_user_id()
returns text
language sql
stable
as $$
  select (auth.uid())::text;
$$;

create or replace function tb_fo_is_active_field_officer()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (auth.uid())::text
      and status = 'active'
      and role = 'fo'
  );
$$;

create or replace function tb_fo_is_active_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select 'fo' = any(allowed_roles)
    and public.tb_fo_is_active_field_officer();
$$;

create or replace function tb_fo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select false;
$$;

create or replace function tb_fo_can_access_patient(patient_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.tb_fo_is_active_field_officer()
    and exists (
      select 1
      from public.patients
      where id = patient_key
        and owner_id = (auth.uid())::text
    );
$$;

alter table profiles enable row level security;
alter table patients enable row level security;
alter table lab_results enable row level security;
alter table dot_entries enable row level security;
alter table sputum_followups enable row level security;
alter table contact_people enable row level security;
alter table tpt_records enable row level security;
alter table diary_entries enable row level security;
alter table tasks enable row level security;
alter table providers enable row level security;
alter table report_exports enable row level security;
alter table app_settings enable row level security;

drop policy if exists profiles_select_own_or_admin on profiles;
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select
  using (user_id = (select tb_fo_user_id()));

drop policy if exists profiles_insert_pending_self on profiles;
drop policy if exists profiles_insert_active_self on profiles;
create policy profiles_insert_active_self on profiles
  for insert
  with check (
    user_id = (select tb_fo_user_id())
    and role = 'fo'
    and status = 'active'
  );

drop policy if exists profiles_update_admin on profiles;
drop policy if exists profiles_update_self_to_field_officer on profiles;
create policy profiles_update_self_to_field_officer on profiles
  for update
  using (
    user_id = (select tb_fo_user_id())
    and status <> 'blocked'
  )
  with check (
    user_id = (select tb_fo_user_id())
    and role = 'fo'
    and status = 'active'
  );

drop policy if exists patients_select_owner_or_admin on patients;
drop policy if exists patients_select_owner on patients;
create policy patients_select_owner on patients
  for select
  using (owner_id = (select tb_fo_user_id()));

drop policy if exists patients_insert_owner_or_admin on patients;
drop policy if exists patients_insert_owner on patients;
create policy patients_insert_owner on patients
  for insert
  with check (
    public.tb_fo_is_active_field_officer()
    and owner_id = (select tb_fo_user_id())
  );

drop policy if exists patients_update_owner_or_admin on patients;
drop policy if exists patients_update_owner on patients;
create policy patients_update_owner on patients
  for update
  using (
    public.tb_fo_is_active_field_officer()
    and owner_id = (select tb_fo_user_id())
  )
  with check (
    public.tb_fo_is_active_field_officer()
    and owner_id = (select tb_fo_user_id())
  );

drop policy if exists patients_delete_owner_or_admin on patients;
drop policy if exists patients_delete_owner on patients;
create policy patients_delete_owner on patients
  for delete
  using (
    public.tb_fo_is_active_field_officer()
    and owner_id = (select tb_fo_user_id())
  );

drop policy if exists lab_results_patient_access on lab_results;
create policy lab_results_patient_access on lab_results
  for all
  using (public.tb_fo_can_access_patient(patient_id))
  with check (public.tb_fo_can_access_patient(patient_id));

drop policy if exists dot_entries_patient_access on dot_entries;
create policy dot_entries_patient_access on dot_entries
  for all
  using (public.tb_fo_can_access_patient(patient_id))
  with check (public.tb_fo_can_access_patient(patient_id));

drop policy if exists sputum_followups_patient_access on sputum_followups;
create policy sputum_followups_patient_access on sputum_followups
  for all
  using (public.tb_fo_can_access_patient(patient_id))
  with check (public.tb_fo_can_access_patient(patient_id));

drop policy if exists contact_people_patient_access on contact_people;
create policy contact_people_patient_access on contact_people
  for all
  using (public.tb_fo_can_access_patient(patient_id))
  with check (public.tb_fo_can_access_patient(patient_id));

drop policy if exists tpt_records_patient_access on tpt_records;
create policy tpt_records_patient_access on tpt_records
  for all
  using (patient_id is not null and public.tb_fo_can_access_patient(patient_id))
  with check (patient_id is not null and public.tb_fo_can_access_patient(patient_id));

drop policy if exists diary_entries_owner_or_admin on diary_entries;
drop policy if exists diary_entries_owner on diary_entries;
create policy diary_entries_owner on diary_entries
  for all
  using (user_id = (select tb_fo_user_id()))
  with check (
    public.tb_fo_is_active_field_officer()
    and user_id = (select tb_fo_user_id())
  );

drop policy if exists tasks_patient_access on tasks;
create policy tasks_patient_access on tasks
  for all
  using (patient_id is not null and public.tb_fo_can_access_patient(patient_id))
  with check (patient_id is not null and public.tb_fo_can_access_patient(patient_id));

drop policy if exists providers_active_users on providers;
drop policy if exists providers_active_field_officers on providers;
create policy providers_active_field_officers on providers
  for all
  using (public.tb_fo_is_active_field_officer())
  with check (public.tb_fo_is_active_field_officer());

drop policy if exists report_exports_owner_or_admin on report_exports;
drop policy if exists report_exports_owner on report_exports;
create policy report_exports_owner on report_exports
  for all
  using (generated_by = (select tb_fo_user_id()))
  with check (
    public.tb_fo_is_active_field_officer()
    and generated_by = (select tb_fo_user_id())
  );

drop policy if exists app_settings_admin_only on app_settings;
drop policy if exists app_settings_active_field_officers on app_settings;
create policy app_settings_active_field_officers on app_settings
  for all
  using (public.tb_fo_is_active_field_officer())
  with check (public.tb_fo_is_active_field_officer());

create index if not exists idx_profiles_user_status_role on profiles(user_id, status, role);
create index if not exists idx_report_exports_generated_by on report_exports(generated_by);
