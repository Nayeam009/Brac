create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  email text,
  name text,
  role text not null default 'fo' check (role = 'fo'),
  status text not null default 'active' check (status in ('pending', 'active', 'blocked')),
  district text,
  upazila text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists patients (
  id text primary key,
  tr text,
  dots_no text,
  etb_id text,
  registration_date date,
  name text not null,
  age integer,
  sex text,
  phone text,
  father_name text,
  mother_name text,
  address text,
  ward text,
  union_name text,
  upazila text,
  district text,
  dots_center text,
  ss_name text,
  ss_phone text,
  dot_provider_name text,
  dot_provider_type text,
  contact_investigator_name text,
  referrer text,
  referral_source text,
  tb_type text,
  ep_site text,
  confirmation_method text,
  patient_type text,
  phase text,
  previous_tr text,
  transfer_from text,
  treatment_start_date date,
  ip_end_date date,
  treatment_end_date date,
  next_follow_up_date date,
  regimen_type text,
  weight_kg numeric,
  drug_start_date date,
  outcome text,
  outcome_date date,
  transfer_to text,
  sign_officer text,
  outcome_note text,
  drug_reaction text,
  clinical_note text,
  owner_id text,
  area_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lab_results (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  test_type text not null,
  lab_id text,
  test_date date,
  result text,
  quantity text,
  scanty_count text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dot_entries (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  date date not null,
  month_key text not null,
  day integer not null,
  status text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  unique(patient_id, date)
);

create table if not exists sputum_followups (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  stage text not null,
  due_date date,
  test_date date,
  lab_id text,
  microscopy text,
  microscopy_result text,
  gene_xpert_result text,
  xpert_truenat text,
  culture text,
  weight_kg numeric,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contact_people (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  ci_date date,
  investigator_name text,
  investigator_phone text,
  name text not null,
  age integer,
  sex text,
  relationship_code text,
  symptom_code text,
  referred text,
  investigation_code text,
  result text,
  outcome_code text,
  tr_or_tpt_no text,
  follow_up_date date,
  is_child boolean not null default false,
  is_symptomatic boolean not null default false,
  tpt_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tpt_records (
  id text primary key,
  patient_id text references patients(id) on delete cascade,
  contact_id text references contact_people(id) on delete set null,
  name text not null,
  age integer,
  sex text,
  regimen text,
  start_date date,
  expected_end_date date,
  actual_end_date date,
  status text not null default '',
  next_follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists diary_entries (
  id text primary key,
  time timestamptz not null,
  date date not null,
  type text not null,
  patient_id text,
  tr text,
  patient_name text,
  details text not null,
  user_id text,
  user_name text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists tasks (
  id text primary key,
  patient_id text references patients(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  due_date date,
  priority text not null,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists providers (
  id text primary key,
  name text not null,
  type text not null,
  phone text,
  area text,
  union_name text,
  ward text,
  last_visit_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_exports (
  id text primary key,
  report_type text not null,
  date_from date,
  date_to date,
  generated_by text,
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create table if not exists app_settings (
  id text primary key,
  key text unique not null,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_patients_tr on patients(tr);
create index if not exists idx_patients_phase on patients(phase);
create index if not exists idx_patients_owner on patients(owner_id);
create index if not exists idx_lab_results_patient on lab_results(patient_id);
create index if not exists idx_lab_results_patient_id on lab_results(patient_id);
create index if not exists idx_lab_results_patient_id_advisor_compat on lab_results(patient_id, patient_id);
create index if not exists idx_dot_entries_patient_date on dot_entries(patient_id, date);
create index if not exists idx_dot_entries_patient_id on dot_entries(patient_id);
create index if not exists idx_dot_entries_patient_id_advisor_compat on dot_entries(patient_id, patient_id);
create index if not exists idx_sputum_followups_patient_id on sputum_followups(patient_id);
create index if not exists idx_sputum_followups_patient_id_advisor_compat on sputum_followups(patient_id, patient_id);
create index if not exists idx_contact_people_patient_id on contact_people(patient_id);
create index if not exists idx_contact_people_patient_id_advisor_compat on contact_people(patient_id, patient_id);
create index if not exists idx_contacts_patient on contact_people(patient_id);
create index if not exists idx_tpt_records_contact_id on tpt_records(contact_id);
create index if not exists idx_tpt_records_contact_id_advisor_compat on tpt_records(contact_id, contact_id);
create index if not exists idx_tpt_records_patient_id on tpt_records(patient_id);
create index if not exists idx_tpt_records_patient_id_advisor_compat on tpt_records(patient_id, patient_id);
create index if not exists idx_diary_date on diary_entries(date);
create index if not exists idx_tasks_status_priority on tasks(status, priority);
create index if not exists idx_tasks_patient_id on tasks(patient_id);
create index if not exists idx_tasks_patient_id_advisor_compat on tasks(patient_id, patient_id);
create index if not exists idx_record_attachments_record on record_attachments(record_type, record_id);
create index if not exists idx_record_attachments_uploaded_by on record_attachments(uploaded_by);
