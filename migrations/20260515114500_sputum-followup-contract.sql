alter table sputum_followups
  add column if not exists due_date date,
  add column if not exists microscopy_result text,
  add column if not exists gene_xpert_result text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_sputum_followups_patient_stage on sputum_followups(patient_id, stage);

alter table tpt_records
  drop constraint if exists tpt_records_patient_id_fkey;

alter table tpt_records
  add constraint tpt_records_patient_id_fkey
  foreign key (patient_id) references patients(id) on delete cascade;
