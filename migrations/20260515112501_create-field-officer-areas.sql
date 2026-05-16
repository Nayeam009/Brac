create table if not exists field_officer_areas (
  id text primary key,
  area_name text not null,
  district text not null,
  upazila text not null,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  sample_patient_count integer not null default 0 check (sample_patient_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table field_officer_areas enable row level security;

drop policy if exists field_officer_areas_read_active_fo on field_officer_areas;
create policy field_officer_areas_read_active_fo on field_officer_areas
  for select
  using (public.tb_fo_is_active_field_officer());

insert into field_officer_areas (
  id,
  area_name,
  district,
  upazila,
  priority,
  sample_patient_count,
  notes
)
values
  (
    'area_sirajdikhan_uhc',
    'Sirajdikhan UHC Catchment',
    'Munshiganj',
    'Sirajdikhan',
    'high',
    18,
    'Sample catchment for Field Officer onboarding.'
  ),
  (
    'area_sreenagar_cluster',
    'Sreenagar Community Cluster',
    'Munshiganj',
    'Sreenagar',
    'normal',
    12,
    'Sample community follow-up area.'
  ),
  (
    'area_louhajang_dots',
    'Louhajang DOTS Cluster',
    'Munshiganj',
    'Louhajang',
    'normal',
    9,
    'Sample DOTS support area.'
  )
on conflict (id) do update
set area_name = excluded.area_name,
    district = excluded.district,
    upazila = excluded.upazila,
    priority = excluded.priority,
    sample_patient_count = excluded.sample_patient_count,
    notes = excluded.notes,
    updated_at = now();
