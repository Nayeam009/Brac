-- Create the private InsForge Storage bucket with:
-- npx @insforge/cli storage create-bucket record-attachments --private

create table if not exists record_attachments (
  id text primary key,
  record_type text not null default 'patient' check (record_type in ('patient')),
  record_id text not null references patients(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size integer not null default 0 check (file_size >= 0),
  bucket text not null default 'record-attachments',
  storage_key text not null,
  url text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_record_attachments_record on record_attachments(record_type, record_id);
create index if not exists idx_record_attachments_uploaded_by on record_attachments(uploaded_by);

alter table record_attachments enable row level security;

drop policy if exists record_attachments_select_patient_owner on record_attachments;
create policy record_attachments_select_patient_owner on record_attachments
  for select
  using (
    record_type = 'patient'
    and public.tb_fo_can_access_patient(record_id)
  );

drop policy if exists record_attachments_insert_patient_owner on record_attachments;
create policy record_attachments_insert_patient_owner on record_attachments
  for insert
  with check (
    record_type = 'patient'
    and bucket = 'record-attachments'
    and uploaded_by = (select public.tb_fo_user_id())
    and split_part(storage_key, '/', 1) = (select public.tb_fo_user_id())
    and public.tb_fo_can_access_patient(record_id)
  );

drop policy if exists record_attachments_delete_own on record_attachments;
create policy record_attachments_delete_own on record_attachments
  for delete
  using (
    uploaded_by = (select public.tb_fo_user_id())
    and record_type = 'patient'
    and public.tb_fo_can_access_patient(record_id)
  );
