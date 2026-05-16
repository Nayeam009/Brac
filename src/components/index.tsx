import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  AlertTriangle, BarChart3, BookOpen, CalendarCheck, CheckCircle2,
  ChevronDown, ClipboardList, Database, FileText, Home, LogOut, Menu, Plus,
  PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, Stethoscope, UserRound, Users, X,
} from "lucide-react";
import type { DiaryEntry, DotEntry, Patient, Profile, Task } from "../domain/types";
import { formatDateDisplay, formatDateTimeDisplay, parseDateInput, toLocalIsoMonth } from "../lib/dateFormat";
import { dateForTreatmentDay, TB_IP_DAYS, TB_TOTAL_DAYS, type DrugDoseLine, type DrugDosePlan } from "../domain/automation";
import { getPatientHouseLocation } from "../lib/houseLocation";

export type Tone = "success" | "warning" | "danger" | "info" | "purple" | "neutral";

/* ── Toast ── */
export type ToastItem = { id: string; message: string; tone?: "success" | "error" | "warning" };

export function ToastContainer({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-container">
      {items.map((t) => (
        <ToastSingle key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastSingle({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => { const timer = setTimeout(() => dismissRef.current(), 3500); return () => clearTimeout(timer); }, []);
  return (
    <div className={`toast ${item.tone === "error" ? "error" : item.tone === "warning" ? "warning" : ""}`}>
      {item.tone === "error" ? <AlertTriangle size={18} /> : item.tone === "warning" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      <span>{item.message}</span>
      <button style={{ background: "none", border: 0, color: "inherit", marginLeft: "auto" }} onClick={onDismiss} aria-label="বন্ধ করুন"><X size={16} /></button>
    </div>
  );
}

/* ── Confirm Modal ── */
export function ConfirmModal({ title, message, confirmLabel = "নিশ্চিত", danger = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button when modal opens
  useEffect(() => { cancelRef.current?.focus(); }, []);

  // ESC key handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onCancel(); return; }
    // Trap focus within modal
    if (e.key === "Tab") {
      const focusable = overlayRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel} onKeyDown={handleKeyDown} ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="modal-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>বাতিল</button>
          <button type="button" className={danger ? "danger" : "confirm"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ── FAB ── */
export function FAB({ onClick }: { onClick: () => void }) {
  return <button className="fab" type="button" onClick={onClick} aria-label="নতুন রোগী"><Plus size={28} /></button>;
}

/* ── App Shell ── */
export function AppShell({ children, onNewPatient, onSignOut, profile, syncMessage = "InsForge ready", diaryTrackingEnabled = true, pendingSyncCount = 0, onRetrySync }: {
  children: ReactNode; onNewPatient: () => void; onSignOut?: () => void; profile?: Profile | null; syncMessage?: string; diaryTrackingEnabled?: boolean; pendingSyncCount?: number; onRetrySync?: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Close more menu on navigation
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const navItems = [
    { to: "/", label: "ড্যাশবোর্ড", icon: <Home size={20} /> },
    { to: "/patients", label: "রোগী", icon: <Users size={20} /> },
    { to: "/today", label: "আজকের কাজ", icon: <ClipboardList size={20} /> },
    { to: "/diary", label: "FO ডায়েরি", icon: <BookOpen size={20} /> },
    { to: "/reports", label: "রিপোর্ট", icon: <BarChart3 size={20} /> },
    { to: "/providers", label: "SS/DOT", icon: <ShieldCheck size={20} /> },
    { to: "/quality", label: "Data Quality", icon: <Database size={20} /> },
    { to: "/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  // Bottom nav: first 4 items + "More" button
  const bottomPrimary = navItems.slice(0, 4);
  const moreItems = navItems.slice(4);
  const isMoreActive = moreItems.some((item) => location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to)));

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="Desktop sidebar">
        <div className="sidebar-head">
          <div className="brand">
          <div className="brand-mark"><Stethoscope size={24} /></div>
          <div className="brand-text"><strong>TB-FO Assistant</strong><span>BRAC TB Field Workflow</span></div>
          </div>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
        <button className="primary-action" type="button" onClick={onNewPatient}><Plus size={18} /> নতুন রোগী</button>
        <nav className="side-nav" aria-label="প্রধান নেভিগেশন">
          {navItems.map((item) => (
            <NavLink aria-label={item.label} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} key={item.to} to={item.to} end={item.to === "/"}>{item.icon}<span>{item.label}</span></NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title"><p>InsForge connected · Offline-ready PWA</p><h1>TB-FO Assistant</h1></div>
          <div className="topbar-actions">
            {!diaryTrackingEnabled ? <span className="sync-pill warning">Diary off</span> : null}
            <span className="sync-pill">{syncMessage}</span>
            {pendingSyncCount > 0 && onRetrySync ? <button className="sync-pill sync-action" type="button" onClick={onRetrySync}>Retry {pendingSyncCount}</button> : null}
            <span className="user-chip"><UserRound size={16} /><span>{profile?.name || profile?.email || "FO"}</span></span>
            {onSignOut ? <button aria-label="Sign out" className="ghost-button compact" type="button" onClick={onSignOut}><LogOut size={16} /><span>Sign out</span></button> : null}
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="মোবাইল নেভিগেশন">
        {bottomPrimary.map((item) => (
          <NavLink className={({ isActive }) => `bottom-item ${isActive ? "active" : ""}`} key={item.to} to={item.to} end={item.to === "/"}>{item.icon}<span>{item.label}</span></NavLink>
        ))}
        <button type="button" className={`bottom-item ${isMoreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)} aria-label="আরও মেনু" aria-expanded={moreOpen}>
          <Menu size={20} /><span>আরও</span>
        </button>
      </nav>
      {/* Mobile More Menu */}
      {moreOpen && (
        <>
          <div className="mobile-more-overlay" onClick={() => setMoreOpen(false)} />
          <div className="mobile-more-panel" role="dialog" aria-modal="true" aria-label="আরও নেভিগেশন">
            <h3>আরও মেনু</h3>
            <div className="mobile-more-grid">
              {moreItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `mobile-more-item ${isActive ? "active" : ""}`} onClick={() => setMoreOpen(false)}>{item.icon}<span>{item.label}</span></NavLink>
              ))}
              <button type="button" className="mobile-more-item" onClick={() => { setMoreOpen(false); onNewPatient(); }}>
                <Plus size={20} /><span>নতুন রোগী</span>
              </button>
              {onSignOut ? (
                <button type="button" className="mobile-more-item" onClick={() => { setMoreOpen(false); onSignOut(); }} style={{ color: "var(--red)" }}>
                  <LogOut size={20} /><span>Sign out</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
      <FAB onClick={onNewPatient} />
    </div>
  );
}

/* ── Layout ── */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (<div className="page-header"><div className="page-header-copy"><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action ? <div className="page-header-action">{action}</div> : null}</div>);
}

export function SectionCard({ title, children, tone = "neutral", action, defaultOpen = true }: {
  title: string; children: ReactNode; tone?: Tone; action?: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section-card tone-${tone}`}>
      <div className="section-head">
        <button className="section-toggle" type="button" onClick={() => setOpen(!open)}>
          <h3>{title}</h3>
          <ChevronDown size={20} className={`chevron ${open ? "open" : ""}`} />
        </button>
        {action}
      </div>
      <div className={`section-body ${open ? "" : "collapsed"}`}>{children}</div>
    </section>
  );
}

/* ── Stats ── */
export function StatCard({ label, value, helper, tone = "neutral", icon }: {
  label: string; value: string | number; helper?: string; tone?: Tone; icon?: ReactNode;
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{icon || <BarChart3 size={18} />}</div>
      <div><span>{label}</span><strong>{value}</strong>{helper ? <small>{helper}</small> : null}</div>
    </article>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

/* ── Search ── */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search-box"><Search size={18} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>
  );
}

/* ── Radio Chips ── */
export function RadioChips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="chip-group">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? "selected" : ""}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ── Patient Card ── */
export function PatientCard({ patient, tasks = [], onOpen }: { patient: Patient; tasks?: Task[]; onOpen: () => void }) {
  const urgent = tasks.some((t) => t.patientId === patient.id && t.priority === "Critical");
  const missed = tasks.some((t) => t.patientId === patient.id && (t.type === "DOT_MISSED" || t.type === "DOT_NOT_UPDATED"));
  return (
    <button className={`patient-card ${urgent ? "urgent" : ""}`} type="button" onClick={onOpen}>
      <div className="avatar">{patient.name.slice(0, 1)}</div>
      <div className="patient-main">
        <div className="patient-title">
          <strong>{patient.name}</strong>
          <StatusBadge tone={patient.phase === "Pre-treatment" ? "warning" : patient.outcome ? "success" : "info"}>{patient.phase || patient.outcome || "নতুন"}</StatusBadge>
        </div>
        <p><span className="mono">TR: {patient.tr || "—"}</span> · {patient.age || "—"} বছর · {patient.sex || "—"}</p>
        <p>{patient.union || patient.address || "ঠিকানা নেই"} · SS: {patient.ssName || "—"}</p>
        <div className="badge-row">
          {patient.tbType ? <StatusBadge tone="info">{patient.tbType} {patient.confirmationMethod || ""}</StatusBadge> : null}
          {getPatientHouseLocation(patient.metadata) ? <StatusBadge tone="success">Location saved</StatusBadge> : null}
          {patient.nextFollowUpDate ? <StatusBadge tone="warning">Follow-up {formatDateDisplay(patient.nextFollowUpDate)}</StatusBadge> : null}
          {missed ? <StatusBadge tone="danger">DOT Missed</StatusBadge> : null}
          {urgent ? <StatusBadge tone="danger">Critical</StatusBadge> : null}
        </div>
      </div>
    </button>
  );
}

/* ── Worklist Item ── */
export function WorklistItem({ task, patient, onOpen }: { task: Task; patient?: Patient; onOpen?: () => void }) {
  const tone: Tone = task.priority === "Critical" ? "danger" : task.priority === "High" ? "warning" : "info";
  return (
    <article className={`work-item tone-${tone}`}>
      <div className="priority-strip" />
      <div>
        <div className="work-title"><strong>{task.title}</strong><StatusBadge tone={tone}>{task.priority}</StatusBadge></div>
        <p>{task.description}</p>
        <small>{patient?.name || "General"} {task.dueDate ? `· Due ${formatDateDisplay(task.dueDate)}` : ""}</small>
      </div>
      {onOpen && patient ? <button className="ghost-button" type="button" onClick={onOpen}>খুলুন</button> : null}
    </article>
  );
}

/* ── Diary Timeline ── */
const diaryUpdateLabel = (type: string) => {
  if (type === "New Patient") return "New patient update";
  if (type === "Report Generated") return "Report update";
  if (type === "Delete") return "Delete update";
  return type.replace(/ Updated$/, " update");
};

const diaryGroupKey = (entry: DiaryEntry) => [entry.date, entry.patientId || entry.tr || entry.patientName || entry.userName || "general"].join("|");

const groupDiaryEntries = (entries: DiaryEntry[]) => {
  const groups = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    const key = diaryGroupKey(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return Array.from(groups.entries()).map(([key, groupEntries]) => {
    const sortedEntries = [...groupEntries].sort((a, b) => (b.time || b.date).localeCompare(a.time || a.date));
    return { key, entries: sortedEntries, latest: sortedEntries[0] };
  }).sort((a, b) => (b.latest.time || b.latest.date).localeCompare(a.latest.time || a.latest.date));
};

export function DiaryTimeline({ entries }: { entries: DiaryEntry[] }) {
  const groups = groupDiaryEntries(entries);
  return (
    <div className="timeline summary-timeline">
      {groups.map((group) => {
        const typeCounts = group.entries.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.type] = (acc[entry.type] || 0) + 1;
          return acc;
        }, {});
        const patientName = group.latest.patientName || "General Activity";
        const visibleDetails = group.entries.slice(0, 3);
        const hiddenDetails = group.entries.slice(3);
        return (
        <article className="timeline-item timeline-summary-card" key={group.key}>
          <div className="timeline-dot"><CheckCircle2 size={16} /></div>
          <div className="timeline-summary-body">
            <div className="timeline-head">
              <div>
                <strong>{patientName}</strong>
                <small>{formatDateTimeDisplay(group.latest.time) || formatDateDisplay(group.latest.date)} · {group.latest.tr || group.latest.userName || "FO"}</small>
              </div>
              <StatusBadge tone="info">Update Summary</StatusBadge>
            </div>
            <p className="timeline-summary-line">
              {group.entries.length} update{group.entries.length > 1 ? "s" : ""} recorded: {Object.entries(typeCounts).map(([type, count]) => `${diaryUpdateLabel(type)} ${count}`).join(" · ")}
            </p>
            <div className="timeline-chip-row">
              {Object.entries(typeCounts).map(([type, count]) => <span key={type}>{diaryUpdateLabel(type)}: {count}</span>)}
            </div>
            <ul className="timeline-update-list">
              {visibleDetails.map((entry) => (
                <li key={entry.id}>
                  <span>{diaryUpdateLabel(entry.type)}</span>
                  <strong>{entry.details}</strong>
                </li>
              ))}
            </ul>
            {hiddenDetails.length > 0 && (
              <details className="timeline-details">
                <summary>Show all {group.entries.length} update details</summary>
                <ul className="timeline-update-list">
                  {hiddenDetails.map((entry) => (
                    <li key={entry.id}>
                      <span>{formatDateTimeDisplay(entry.time) || formatDateDisplay(entry.date)} · {diaryUpdateLabel(entry.type)}</span>
                      <strong>{entry.details}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </article>
        );
      })}
    </div>
  );
}

/* ── DOT Grid with month nav, legend, stats ── */
const DAY_MS = 86400000;
const parseIsoDay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const inclusiveTreatmentDays = (startDate: string | undefined, endDate: string | undefined) => {
  if (!startDate || !endDate) return TB_TOTAL_DAYS;
  const start = parseIsoDay(startDate);
  const end = parseIsoDay(endDate);
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return Number.isFinite(days) && days > 0 ? Math.max(TB_TOTAL_DAYS, days) : TB_TOTAL_DAYS;
};
const treatmentDayForDate = (treatmentStartDate: string | undefined, dateKey: string, totalTreatmentDays = TB_TOTAL_DAYS) => {
  if (!treatmentStartDate) return null;
  const start = parseIsoDay(treatmentStartDate);
  const current = parseIsoDay(dateKey);
  const day = Math.floor((current.getTime() - start.getTime()) / DAY_MS) + 1;
  if (day < 1 || day > totalTreatmentDays) return null;
  return { day, medicine: day <= TB_IP_DAYS ? "4FDC" : "2FDC", phase: day <= TB_IP_DAYS ? "ip" : "cp" };
};

const lineForPhase = (dosePlan: DrugDosePlan | null | undefined, phase: "ip" | "cp"): DrugDoseLine | undefined =>
  dosePlan?.lines.find((line) => phase === "ip" ? /intensive/i.test(line.phase) : /continuation/i.test(line.phase)) ||
  (phase === "cp" ? dosePlan?.lines.find((line) => /2fdc|hr \(/i.test(line.drug)) : dosePlan?.lines[0]);
const shortMedicineName = (line: DrugDoseLine | undefined, fallback: "4FDC" | "2FDC") => {
  const drug = line?.drug || "";
  if (/3fdc/i.test(drug)) return "3FDC";
  if (/4fdc|hrze/i.test(drug)) return "4FDC";
  if (/2fdc|hr \(/i.test(drug)) return "2FDC";
  return fallback;
};
const shortDoseText = (line: DrugDoseLine | undefined) => line?.tabletsPerDay ? `${line.tabletsPerDay} tab${line.tabletsPerDay > 1 ? "s" : ""}/day` : "";

export function DotGrid({ patientId, entries, monthKey, onMonthChange, onToggle, treatmentStartDate, treatmentEndDate, startSource = "missing", dosePlan }: {
  patientId: string; entries: DotEntry[]; monthKey: string; treatmentStartDate?: string; treatmentEndDate?: string; startSource?: "drug-start" | "missing"; dosePlan?: DrugDosePlan | null;
  onMonthChange: (key: string) => void; onToggle: (day: number, status: DotEntry["status"]) => void;
}) {
  const patientEntries = entries.filter((e) => e.patientId === patientId);
  const monthEntries = patientEntries.filter((e) => e.monthKey === monthKey);
  const current = new Map(monthEntries.map((e) => [e.day, e.status]));
  const statusByDate = new Map(patientEntries.map((e) => [e.date, e.status]));
  const cycle = (s: DotEntry["status"]) => (s === "done" ? "missed" : s === "missed" ? "supervised" : s === "supervised" ? "" : "done");
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const doneCount = monthEntries.filter((e) => e.status === "done").length;
  const missedCount = monthEntries.filter((e) => e.status === "missed").length;
  const supCount = monthEntries.filter((e) => e.status === "supervised").length;
  const adherence = doneCount + supCount + missedCount > 0 ? Math.round(((doneCount + supCount) / (doneCount + supCount + missedCount)) * 100) : 0;
  const totalTreatmentDays = inclusiveTreatmentDays(treatmentStartDate, treatmentEndDate);
  const continuationDays = Math.max(totalTreatmentDays - TB_IP_DAYS, 0);
  const planEndDate = treatmentStartDate ? dateForTreatmentDay(treatmentStartDate, totalTreatmentDays) : "";
  const planDays = treatmentStartDate ? Array.from({ length: totalTreatmentDays }, (_, i) => {
    const day = i + 1;
    const date = dateForTreatmentDay(treatmentStartDate, day);
    return { day, date, phase: day <= TB_IP_DAYS ? "ip" : "cp", status: statusByDate.get(date) || "" };
  }) : [];
  const countPlan = (phase: "ip" | "cp") => {
    const target = phase === "ip" ? Math.min(TB_IP_DAYS, totalTreatmentDays) : continuationDays;
    const days = planDays.filter((d) => d.phase === phase);
    const taken = days.filter((d) => d.status === "done" || d.status === "supervised").length;
    const missed = days.filter((d) => d.status === "missed").length;
    const recorded = taken + missed;
    return { target, taken, missed, recorded, percent: target ? Math.round((taken / target) * 100) : 0, adherence: recorded ? Math.round((taken / recorded) * 100) : 0 };
  };
  const ipProgress = countPlan("ip");
  const cpProgress = countPlan("cp");
  const totalTaken = ipProgress.taken + cpProgress.taken;
  const totalRecorded = ipProgress.recorded + cpProgress.recorded;
  const totalMissed = ipProgress.missed + cpProgress.missed;
  const totalProgress = Math.round((totalTaken / totalTreatmentDays) * 100);
  const totalAdherence = totalRecorded ? Math.round((totalTaken / totalRecorded) * 100) : 0;
  const ipLine = lineForPhase(dosePlan, "ip");
  const cpLine = lineForPhase(dosePlan, "cp");
  const ipMedicine = shortMedicineName(ipLine, "4FDC");
  const cpMedicine = shortMedicineName(cpLine, "2FDC");
  const ipDose = shortDoseText(ipLine);
  const cpDose = shortDoseText(cpLine);
  const startLabel = "Drug start";

  const prevMonth = () => { const d = new Date(y, m - 2, 1); onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const nextMonth = () => { const d = new Date(y, m, 1); onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };

  return (
    <div className="dot-tracker">
      {treatmentStartDate ? (
        <div className="dot-plan-panel" aria-label="medicine consumption plan">
          <article className="dot-plan-card four-fdc">
            <span>{ipMedicine} intensive{ipDose ? ` · ${ipDose}` : ""}</span>
            <strong>{ipProgress.taken}/{ipProgress.target} days</strong>
            <div className="dot-progress-bar"><i style={{ width: `${ipProgress.percent}%` }} /></div>
            <small>Day 1-60 · {ipLine?.doseText || "Dose from Drug Regimen"} · Missed {ipProgress.missed} · Adherence {ipProgress.adherence}%</small>
          </article>
          <article className="dot-plan-card two-fdc">
            <span>{cpMedicine} continuation{cpDose ? ` · ${cpDose}` : ""}</span>
            <strong>{cpProgress.taken}/{cpProgress.target} days</strong>
            <div className="dot-progress-bar"><i style={{ width: `${cpProgress.percent}%` }} /></div>
            <small>Day 61-{totalTreatmentDays} · {cpLine?.doseText || "Dose from Drug Regimen"} · Missed {cpProgress.missed} · Adherence {cpProgress.adherence}%</small>
          </article>
          <article className="dot-plan-card total">
            <span>Total treatment</span>
            <strong>{totalTaken}/{totalTreatmentDays} days</strong>
            <div className="dot-progress-bar"><i style={{ width: `${totalProgress}%` }} /></div>
            <small>{startLabel} {formatDateDisplay(treatmentStartDate)} to {formatDateDisplay(planEndDate)} · Missed {totalMissed} · Adherence {totalAdherence}%</small>
          </article>
        </div>
      ) : (
        <p className="dot-plan-empty">Drug start date দিলে 4FDC 60 দিন + 2FDC 120 দিন tracking দেখা যাবে।</p>
      )}
      {treatmentStartDate && dosePlan ? (
        <div className="dot-sync-strip">
          <strong>DOT follows Drug Regimen</strong>
          <span>{startLabel} {formatDateDisplay(treatmentStartDate)} · Day 1-60 {ipMedicine}{ipDose ? ` ${ipDose}` : ""} · Day 61-{totalTreatmentDays} {cpMedicine}{cpDose ? ` ${cpDose}` : ""}</span>
        </div>
      ) : null}
      <div className="month-nav dot-month-toolbar">
        <button type="button" onClick={prevMonth}>◀</button>
        <strong>{String(m).padStart(2, "0")}/{y}</strong>
        <button type="button" onClick={nextMonth}>▶</button>
        <button type="button" onClick={() => onMonthChange(toLocalIsoMonth())}>Today</button>
        {treatmentStartDate ? <button type="button" onClick={() => onMonthChange(treatmentStartDate.slice(0, 7))}>{startSource === "drug-start" ? "Drug start" : "Start"}</button> : null}
      </div>
      <div className="dot-legend">
        <span><span className="swatch swatch-4fdc" /> {ipMedicine} 60 days{ipDose ? ` · ${ipDose}` : ""}</span>
        <span><span className="swatch swatch-2fdc" /> {cpMedicine} {continuationDays} days{cpDose ? ` · ${cpDose}` : ""}</span>
        <span><span className="swatch" style={{ background: "#e8f5f0" }} /> Done</span>
        <span><span className="swatch" style={{ background: "#fdeaea" }} /> Missed</span>
        <span><span className="swatch" style={{ background: "#e9f3fb" }} /> Supervised</span>
        <span><span className="swatch" style={{ background: "#f8fbfa" }} /> Empty</span>
      </div>
      <div className="dot-grid" aria-label="DOT calendar grid">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const status = current.get(day) || "";
          const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
          const plan = treatmentDayForDate(treatmentStartDate, dateKey, totalTreatmentDays);
          const phase = plan?.phase as "ip" | "cp" | undefined;
          const line = phase ? lineForPhase(dosePlan, phase) : undefined;
          const medicine = phase === "ip" ? ipMedicine : phase === "cp" ? cpMedicine : plan?.medicine;
          const dose = shortDoseText(line);
          return (
            <button
              aria-label={`দিন ${day}${plan ? `, treatment day ${plan.day}, ${medicine}${dose ? `, ${dose}` : ""}` : ""}: ${status || "blank"}`}
              className={`dot-cell status-${status || "blank"} ${plan ? `in-plan phase-${plan.phase}` : "outside-plan"}`}
              key={day}
              type="button"
              onClick={() => onToggle(day, cycle(status))}
            >
              <span className="dot-day-number">{day}</span>
              <strong>{status === "done" ? "✓" : status === "missed" ? "×" : status === "supervised" ? "S" : "—"}</strong>
              {plan ? <small>{medicine}</small> : null}
              {dose ? <span className="dot-cell-dose">{dose}</span> : null}
              {plan ? <em>D{plan.day}</em> : null}
            </button>
          );
        })}
      </div>
      <div className="dot-stats">
        <span>Month Done: {doneCount}</span><span>Month Missed: {missedCount}</span><span>Supervised: {supCount}</span><span>Month Adherence: {adherence}%</span>
      </div>
      <small style={{ color: "var(--muted)" }}>প্রতিটি DOT update FO Diary-তে সংরক্ষিত হবে</small>
    </div>
  );
}

/* ── Phase Timeline ── */
export function PhaseTimeline({ phase }: { phase: string }) {
  const steps = ["Pre-treatment", "Intensive Phase", "Continuation Phase", "Completed"];
  const idx = steps.indexOf(phase);
  return (
    <div className="phase-timeline">
      {steps.map((s, i) => (
        <span key={s}>
          {i > 0 ? <span className="phase-arrow"> → </span> : null}
          <span className={`phase-step ${i === idx ? "active" : i < idx ? "done" : ""}`}>{s}</span>
        </span>
      ))}
    </div>
  );
}

/* ── Alert Card ── */
export function AlertCard({ message, level = "medium", icon }: { message: string; level?: "critical" | "high" | "medium"; icon?: ReactNode }) {
  return <div className={`alert-card ${level}`}>{icon || <AlertTriangle size={18} />}<span>{message}</span></div>;
}

/* ── Other ── */
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="empty-state"><AlertTriangle size={32} /><p>{title}</p>{action}</div>;
}

export function DownloadButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="secondary-button" type="button" onClick={onClick}><FileText size={18} />{children}</button>;
}

export function CalendarMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="calendar-metric"><CalendarCheck size={18} /><span>{label}</span><strong>{value}</strong></div>;
}

/* ── Date Input (dd/mm/yyyy) ── */
export function DateInput({ value, onChange, id, className, style, ...rest }: {
  value: string; onChange: (isoValue: string) => void;
  id?: string; className?: string; style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [display, setDisplay] = useState(() => value ? formatDateDisplay(value) : "");
  const [invalid, setInvalid] = useState(false);

  // Sync when external value changes (e.g. form reset)
  useEffect(() => {
    const formatted = value ? formatDateDisplay(value) : "";
    setDisplay((prev) => {
      // Don't overwrite while user is actively typing a valid partial
      const parsed = parseDateInput(prev);
      if (parsed === value) return prev;
      return formatted;
    });
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Auto-insert slashes: after dd and mm
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length <= 8) {
      if (digits.length > 4) raw = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2) raw = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      else raw = digits;
    }
    setDisplay(raw);
    if (!raw) { setInvalid(false); onChange(""); return; }
    const iso = parseDateInput(raw);
    if (iso) { setInvalid(false); onChange(iso); }
    else { setInvalid(raw.length >= 10); }
  };

  const handleBlur = () => {
    if (!display) { setInvalid(false); return; }
    const iso = parseDateInput(display);
    if (iso) { setDisplay(formatDateDisplay(iso)); setInvalid(false); onChange(iso); }
    else { setInvalid(true); }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      {...rest}
      id={id}
      className={className}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      aria-invalid={invalid || undefined}
      pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
      style={{ ...(style || {}), ...(invalid ? { borderColor: "var(--red)", boxShadow: "0 0 0 2px rgba(220,53,69,.15)" } : {}) }}
      title="তারিখ dd/mm/yyyy ফরম্যাটে লিখুন, যেমন 05/09/2026"
    />
  );
}
