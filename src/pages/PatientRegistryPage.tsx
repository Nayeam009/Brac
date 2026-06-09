import { useMemo, useState } from "react";
import type { Patient, Task } from "../domain/types";
import { PageHeader, PatientCard, SearchBox, StatusBadge } from "../components";

const REGISTRATION_MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function PatientRegistryPage({ patients, tasks, onOpen }: { patients: Patient[]; tasks: Task[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [tbFilter, setTbFilter] = useState("");
  const [registrationMonthFilter, setRegistrationMonthFilter] = useState("");
  const [registrationYearFilter, setRegistrationYearFilter] = useState("");

  const registrationYears = useMemo(() => Array.from(new Set(
    patients
      .map((patient) => patient.registrationDate?.slice(0, 4))
      .filter((year): year is string => Boolean(year)),
  )).sort((a, b) => b.localeCompare(a)), [patients]);

  const filtered = patients.filter((p) => {
    if (query && ![p.name, p.tr, p.phone, p.ssName, p.union].join(" ").toLowerCase().includes(query.toLowerCase())) return false;
    if (phaseFilter && (phaseFilter === "Outcome" ? !p.outcome : p.phase !== phaseFilter || p.outcome)) return false;
    if (tbFilter && p.tbType !== tbFilter) return false;
    if (registrationMonthFilter && p.registrationDate?.slice(5, 7) !== registrationMonthFilter) return false;
    if (registrationYearFilter && p.registrationDate?.slice(0, 4) !== registrationYearFilter) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="সকল রোগী" subtitle="TR, নাম, SS বা ফোন নম্বর দিয়ে খুঁজুন" action={<StatusBadge tone="info">{filtered.length} জন</StatusBadge>} />
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="TR নং, নাম, SS নাম, বা ফোন নম্বর" />
      </div>
      <div className="filter-row">
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} aria-label="Phase filter">
          <option value="">সব Phase</option>
          <option>Pre-treatment</option>
          <option>Intensive Phase</option>
          <option>Continuation Phase</option>
          <option>Completed</option>
          <option value="Outcome">Outcome Recorded</option>
        </select>
        <select value={tbFilter} onChange={(e) => setTbFilter(e.target.value)} aria-label="TB Type filter">
          <option value="">সব TB Type</option>
          <option>Pulmonary</option>
          <option>Extra-pulmonary</option>
        </select>
        <label className="filter-field">
          <span>Registration month</span>
          <select value={registrationMonthFilter} onChange={(e) => setRegistrationMonthFilter(e.target.value)} aria-label="Registration month filter">
            <option value="">All months</option>
            {REGISTRATION_MONTHS.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Registration year</span>
          <select value={registrationYearFilter} onChange={(e) => setRegistrationYearFilter(e.target.value)} aria-label="Registration year filter">
            <option value="">All years</option>
            {registrationYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        {registrationMonthFilter || registrationYearFilter ? (
          <button className="ghost-button" type="button" onClick={() => { setRegistrationMonthFilter(""); setRegistrationYearFilter(""); }}>All registration dates</button>
        ) : null}
      </div>
      <div className="patient-list">
        {filtered.length === 0 ? (
          <div className="empty-state"><p>নির্বাচিত search/filter অনুযায়ী কোনো রোগী পাওয়া যায়নি।</p></div>
        ) : filtered.map((p) => (
          <PatientCard key={p.id} patient={p} tasks={tasks} onOpen={() => onOpen(p.id)} />
        ))}
      </div>
    </>
  );
}
