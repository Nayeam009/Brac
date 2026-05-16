import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { buildDiaryEntry, detectDuplicatePatient, generateWorklist, HISTORICAL_BACK_ENTRY_CUTOFF_DATE, resolvePatientDotPlan, resolvePatientTreatmentSchedule, shouldCreateLiveDiaryEntry, treatmentDayNumberForDate, withResolvedPatientEntryMetadata, TB_IP_DAYS } from "./domain/automation";
import type { ContactPerson, DiaryEntry, DotEntry, LabResult, Patient, Profile, Provider, RecordAttachment, SputumFollowUp, Task, TptRecord } from "./domain/types";
import { AppShell, ConfirmModal, ToastContainer, type ToastItem } from "./components";
import * as repository from "./services/appRepository";
import type { AppData as RepositoryAppData } from "./services/appRepository";
import * as authService from "./services/authService";
import { mergeBackupData, parseBackupData } from "./services/backupService";
import { insforgeConfigError } from "./lib/insforgeClient";
import { formatDateDisplay, toLocalIsoDate } from "./lib/dateFormat";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DataQualityPage = lazy(() => import("./pages/DataQualityPage").then((module) => ({ default: module.DataQualityPage })));
const DiaryPage = lazy(() => import("./pages/DiaryPage").then((module) => ({ default: module.DiaryPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const PatientFormPage = lazy(() => import("./pages/PatientFormPage").then((module) => ({ default: module.PatientFormPage })));
const PatientRegistryPage = lazy(() => import("./pages/PatientRegistryPage").then((module) => ({ default: module.PatientRegistryPage })));
const ProviderPage = lazy(() => import("./pages/ProviderPage").then((module) => ({ default: module.ProviderPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const WorklistPage = lazy(() => import("./pages/WorklistPage").then((module) => ({ default: module.WorklistPage })));

const nowIso = () => new Date().toISOString();
const today = () => toLocalIsoDate();
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const displayDateOrDash = (value?: string) => formatDateDisplay(value) || "—";
const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
const dotStatusLabel = (status?: DotEntry["status"]) => status === "done" ? "done" : status === "missed" ? "missed" : status === "supervised" ? "supervised" : "blank";

const summarizePatientSave = (before: Patient | undefined, after: Patient) => {
  if (!before) {
    return [
      `New patient: TR ${after.tr || "—"}, ${after.name}`,
      after.tbType ? `TB ${after.tbType}${after.confirmationMethod ? `/${after.confirmationMethod}` : ""}` : "",
      after.treatmentStartDate ? `treatment starts ${displayDateOrDash(after.treatmentStartDate)}` : "",
      after.drugStartDate ? `drugs start ${displayDateOrDash(after.drugStartDate)}` : "",
      after.treatmentEndDate ? `course ends ${displayDateOrDash(after.treatmentEndDate)}` : "",
      after.regimenType ? `regimen ${after.regimenType}` : "",
    ].filter(Boolean).join(" · ");
  }

  const changes: string[] = [];
  const addChange = (label: string, oldValue: unknown, newValue: unknown, formatter = (value: unknown) => String(value || "—")) => {
    if (!same(oldValue, newValue)) changes.push(`${label}: ${formatter(oldValue)} → ${formatter(newValue)}`);
  };
  const dateFormatter = (value: unknown) => displayDateOrDash(typeof value === "string" ? value : undefined);
  addChange("phase", before.phase, after.phase);
  addChange("TB type", before.tbType, after.tbType);
  addChange("treatment start", before.treatmentStartDate, after.treatmentStartDate, dateFormatter);
  addChange("drug start", before.drugStartDate, after.drugStartDate, dateFormatter);
  addChange("treatment end", before.treatmentEndDate, after.treatmentEndDate, dateFormatter);
  addChange("next follow-up", before.nextFollowUpDate, after.nextFollowUpDate, dateFormatter);
  addChange("regimen", before.regimenType, after.regimenType);
  addChange("weight", before.weightKg, after.weightKg, (value) => value ? `${value} kg` : "—");
  addChange("DOT provider", before.dotProviderName, after.dotProviderName);
  addChange("SS", before.ssName, after.ssName);
  addChange("outcome", before.outcome, after.outcome);
  return changes.length ? `Record updated: ${changes.slice(0, 8).join(" · ")}${changes.length > 8 ? ` · +${changes.length - 8} more` : ""}` : "Record reviewed; no key tracking fields changed.";
};

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [approved, setApproved] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("InsForge Auth ready");
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pendingVerificationName, setPendingVerificationName] = useState("");
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [dotEntries, setDotEntries] = useState<DotEntry[]>([]);
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [tptRecords, setTptRecords] = useState<TptRecord[]>([]);
  const [sputumFollowUps, setSputumFollowUps] = useState<SputumFollowUp[]>([]);
  const [attachments, setAttachments] = useState<RecordAttachment[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [syncMessage, setSyncMessage] = useState("Loading data...");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const syncErrorRef = useRef<Record<string, number>>({});
  const historicalDotBatchRef = useRef<Record<string, { patient?: Patient; entries: Map<string, DotEntry["status"]> }>>({});
  const historicalDotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone?: ToastItem["tone"]) => {
    const id = uid("t");
    setToasts((c) => [...c, { id, message, tone }]);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((c) => c.filter((t) => t.id !== id)), []);

  // Auth
  useEffect(() => {
    setAuthLoading(true);
    authService.loadAuthGate().then((s) => { 
      setCurrentProfile(s.profile); 
      setApproved(s.accessGranted); 
      setAuthMessage(s.accessGranted ? `${s.profile?.role?.toUpperCase() || "FO"} active` : s.reason === "blocked" ? "Access blocked." : "InsForge Auth ready"); 
    }).catch((e) => { 
      setApproved(false); 
      setAuthMessage(e instanceof Error ? e.message : "Auth failed."); 
    }).finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!approved || !currentProfile) return;
    repository.loadAppData({ profile: currentProfile }).then((r) => { 
      setPatients(r.patients); 
      setLabResults(r.labResults); 
      setDotEntries(r.dotEntries); 
      setContacts(r.contacts); 
      setTptRecords(r.tptRecords); 
      setSputumFollowUps(r.sputumFollowUps);
      setAttachments(r.attachments);
      setDiary(r.diaryEntries); 
      setProviders(r.providers); 
      setSyncMessage(r.patients.length ? "Data loaded" : "No records yet"); 
    }).catch((e) => setSyncMessage(`Read issue · ${e instanceof Error ? e.message : "unknown"}`));
  }, [approved, currentProfile]);

  const tasks: Task[] = useMemo(() => generateWorklist({ today: today(), patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps }), [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps]);

  const runSync = useCallback((label: string, op: () => Promise<unknown>) => { 
    if (!approved) return; 
    op().catch((e) => { 
      console.error(`[Sync:${label}]`, e); 
      const now = Date.now();
      if (now - (syncErrorRef.current[label] || 0) > 5000) {
        syncErrorRef.current[label] = now;
        toast(`${label} sync ব্যর্থ হয়েছে। পরে আবার চেষ্টা করুন।`, "error");
      }
    }); 
  }, [approved, toast]);

  const logDiary = useCallback((entry: Omit<Parameters<typeof buildDiaryEntry>[0], "now">) => {
    const d = buildDiaryEntry({ ...entry, now: new Date() });
    d.userId = currentProfile?.userId;
    d.userName = currentProfile?.name;
    setDiary((c) => [d, ...c]);
    runSync("Diary", () => repository.saveDiaryEntry(d));
  }, [currentProfile, runSync]);

  const flushHistoricalDotDiary = useCallback(() => {
    const batches = historicalDotBatchRef.current;
    historicalDotBatchRef.current = {};
    historicalDotTimerRef.current = null;

    for (const batch of Object.values(batches)) {
      const dates = Array.from(batch.entries.keys()).sort();
      if (!dates.length) continue;
      const range = dates.length > 1 ? ` (${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length - 1])})` : ` (${formatDateDisplay(dates[0])})`;
      const plan = resolvePatientDotPlan(batch.patient || {});
      const treatmentDays = dates
        .map((date) => treatmentDayNumberForDate(plan.startDate, date, plan.endDate))
        .filter((day): day is number => Boolean(day));
      const dayRange = treatmentDays.length
        ? `D${Math.min(...treatmentDays)}${treatmentDays.length > 1 ? `-D${Math.max(...treatmentDays)}` : ""}`
        : "";
      const medicines = Array.from(new Set(treatmentDays.map((day) => day <= TB_IP_DAYS ? "4FDC" : "2FDC")));
      const statusCounts = dates.reduce<Record<string, number>>((acc, date) => {
        const label = dotStatusLabel(batch.entries.get(date));
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      const statusSummary = Object.entries(statusCounts).map(([label, count]) => `${label} ${count}`).join(", ");
      logDiary({
        type: "DOT Updated",
        patient: batch.patient,
        details: `Historical DOT back-entry: ${dates.length} dates updated${range}${dayRange ? ` · ${dayRange}` : ""}${medicines.length ? ` · ${medicines.join("/")}` : ""}${statusSummary ? ` · ${statusSummary}` : ""}.`,
        metadata: { historicalBackEntry: true, dates, entryMode: "historical", statusCounts, treatmentDayRange: dayRange, medicines },
      });
    }
  }, [logDiary]);

  const queueHistoricalDotDiary = useCallback((patient: Patient | undefined, date: string, status: DotEntry["status"]) => {
    const key = patient?.id || "unknown";
    const batch = historicalDotBatchRef.current[key] || { patient, entries: new Map<string, DotEntry["status"]>() };
    batch.patient = patient || batch.patient;
    batch.entries.set(date, status);
    historicalDotBatchRef.current[key] = batch;

    if (historicalDotTimerRef.current) clearTimeout(historicalDotTimerRef.current);
    historicalDotTimerRef.current = setTimeout(flushHistoricalDotDiary, 900);
  }, [flushHistoricalDotDiary]);

  useEffect(() => () => {
    if (historicalDotTimerRef.current) clearTimeout(historicalDotTimerRef.current);
  }, []);

  const savePatient = useCallback((draft: Patient) => {
    const dupes = detectDuplicatePatient(draft, patients, draft.id);
    const treatmentSchedule = resolvePatientTreatmentSchedule(draft);
    const existing = patients.find((p) => p.id === draft.id);
    const p = withResolvedPatientEntryMetadata({ ...draft, ipEndDate: treatmentSchedule.ipEndDate || draft.ipEndDate, treatmentEndDate: treatmentSchedule.treatmentEndDate || draft.treatmentEndDate, id: draft.id || uid("pat"), name: draft.name || "নামহীন রোগী", ownerId: draft.ownerId || currentProfile?.userId, createdAt: draft.createdAt || nowIso(), updatedAt: nowIso(), metadata: { ...(draft.metadata || {}), duplicateIssues: dupes } } as Patient, HISTORICAL_BACK_ENTRY_CUTOFF_DATE);
    setPatients((c) => existing ? c.map((x) => x.id === p.id ? p : x) : [p, ...c]);
    runSync("Patient", () => repository.savePatient(p));
    logDiary({ type: existing ? "Record Updated" : "New Patient", patient: p, details: summarizePatientSave(existing, p) });
    toast(existing ? "রেকর্ড সংরক্ষিত হয়েছে" : "নতুন রোগী নিবন্ধিত হয়েছে");
    navigate(`/patients/${p.id}`);
  }, [patients, currentProfile, approved, logDiary, toast, navigate]);

  const deletePatient = useCallback((patientId: string) => {
    const p = patients.find((x) => x.id === patientId);
    if (!p) return;
    setModal({ title: "রেকর্ড Delete?", message: `${p.name} (TR: ${p.tr || "—"}) এর রেকর্ড permanently delete হবে।`, danger: true, onConfirm: async () => {
      try {
        const cleanup = await repository.deletePatientWithCleanup(patientId, attachments);
        setPatients((c) => c.filter((x) => x.id !== patientId));
        setLabResults((c) => c.filter((x) => x.patientId !== patientId));
        setDotEntries((c) => c.filter((x) => x.patientId !== patientId));
        setContacts((c) => c.filter((x) => x.patientId !== patientId));
        setTptRecords((c) => c.filter((x) => x.patientId !== patientId));
        setSputumFollowUps((c) => c.filter((x) => x.patientId !== patientId));
        setAttachments((c) => c.filter((x) => !(x.recordType === "patient" && x.recordId === patientId)));
        setDiary((c) => c.filter((x) => x.patientId !== patientId));
        logDiary({ type: "Delete", details: `Delete: TR: ${p.tr || "—"}, ${p.name}` });
        toast(cleanup.failedFiles.length ? `রেকর্ড delete হয়েছে, কিন্তু ${cleanup.failedFiles.length} file cleanup failed.` : "রেকর্ড delete হয়েছে", cleanup.failedFiles.length ? "warning" : "error");
        navigate("/patients");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Delete failed.", "error");
      } finally {
        setModal(null);
      }
    }});
  }, [patients, attachments, logDiary, toast, navigate]);

  const saveLabResult = useCallback((lab: LabResult) => {
    const item = { ...lab, id: lab.id || uid("lab"), updatedAt: nowIso(), createdAt: lab.createdAt || nowIso() };
    setLabResults((c) => [item, ...c.filter((e) => e.id !== item.id)]);
    runSync("Lab", () => repository.saveLabResult(item));
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "Lab Updated", patient: p, details: `${item.testType}${item.testDate ? ` ${formatDateDisplay(item.testDate)}` : ""}: ${item.result || "—"}${item.labId ? ` · Lab ${item.labId}` : ""}` });
    toast("Lab result সংরক্ষিত");
  }, [patients, logDiary, toast, approved]);

  const saveDotEntry = useCallback((dot: DotEntry) => {
    const item = { ...dot, id: dot.id || uid("dot"), updatedBy: dot.updatedBy || currentProfile?.userId, updatedAt: nowIso() };
    setDotEntries((c) => [item, ...c.filter((e) => !(e.patientId === item.patientId && e.date === item.date))]);
    runSync("DOT", () => repository.saveDotEntry(item));
    const p = patients.find((x) => x.id === item.patientId);
    const plan = resolvePatientDotPlan(p || {});
    const treatmentDay = treatmentDayNumberForDate(plan.startDate, item.date, plan.endDate);
    const medicine = treatmentDay ? (treatmentDay <= TB_IP_DAYS ? "4FDC" : "2FDC") : "DOT";
    const dayDetail = treatmentDay ? ` · D${treatmentDay} ${medicine}` : "";
    if (shouldCreateLiveDiaryEntry(p, item.date, "DOT Updated", HISTORICAL_BACK_ENTRY_CUTOFF_DATE)) {
      logDiary({ type: "DOT Updated", patient: p, details: `DOT ${formatDateDisplay(item.date)}${dayDetail}: ${dotStatusLabel(item.status)}` });
    } else {
      queueHistoricalDotDiary(p, item.date, item.status);
    }
  }, [patients, currentProfile, logDiary, queueHistoricalDotDiary, runSync]);

  const saveContact = useCallback((contact: ContactPerson) => {
    const item = { ...contact, id: contact.id || uid("ci"), createdAt: contact.createdAt || nowIso(), updatedAt: nowIso(), isChild: Boolean(contact.age != null && contact.age > 0 && contact.age < 5), isSymptomatic: Boolean(contact.symptomCode && contact.symptomCode !== "5"), tptEligible: contact.outcomeCode === "4" || contact.tptEligible };
    setContacts((c) => [item, ...c.filter((e) => e.id !== item.id)]);
    runSync("CI", () => repository.saveContact(item));
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "CI Updated", patient: p, details: `CI contact: ${item.name}${item.result ? ` · result ${item.result}` : ""}${item.followUpDate ? ` · follow-up ${formatDateDisplay(item.followUpDate)}` : ""}` });
    toast("Contact সংরক্ষিত");
  }, [patients, logDiary, toast, approved]);

  const saveTpt = useCallback((record: TptRecord) => {
    const item = { ...record, id: record.id || uid("tpt"), createdAt: record.createdAt || nowIso(), updatedAt: nowIso() };
    setTptRecords((c) => [item, ...c.filter((e) => e.id !== item.id)]);
    runSync("TPT", () => repository.saveTptRecord(item));
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "TPT Updated", patient: p, details: `TPT: ${item.name} (${item.status || "—"})${item.startDate ? ` · start ${formatDateDisplay(item.startDate)}` : ""}${item.expectedEndDate ? ` · end ${formatDateDisplay(item.expectedEndDate)}` : ""}` });
    toast("TPT সংরক্ষিত");
  }, [patients, logDiary, toast, approved]);

  const saveSputum = useCallback((s: SputumFollowUp) => {
    const item = { ...s, id: s.id || uid("sp"), createdAt: s.createdAt || nowIso(), updatedAt: nowIso() };
    setSputumFollowUps((c) => [item, ...c.filter((e) => e.id !== item.id)]);
    runSync("Sputum", () => repository.saveSputumFollowUp(item));
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "Sputum Updated", patient: p, details: `${item.stage} sputum${item.testDate ? ` ${formatDateDisplay(item.testDate)}` : ""}: microscopy ${item.microscopyResult || item.microscopy || "—"} · GeneXpert ${item.geneXpertResult || item.xpertTruenat || "—"}` });
    toast("Sputum follow-up সংরক্ষিত");
  }, [patients, logDiary, toast, approved]);

  const uploadAttachment = useCallback(async (patientId: string, file: File) => {
    if (!currentProfile) {
      const message = "Please sign in again before uploading.";
      toast(message, "error");
      throw new Error(message);
    }
    try {
      const attachment = await repository.uploadRecordAttachment({ patientId, file, profile: currentProfile });
      setAttachments((c) => [attachment, ...c.filter((item) => item.id !== attachment.id)]);
      const p = patients.find((x) => x.id === patientId);
      logDiary({ type: "Record Updated", patient: p, details: `File attached: ${attachment.fileName}` });
      toast("File attached");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      toast(message, "error");
      throw error;
    }
  }, [currentProfile, patients, logDiary, toast]);

  const openAttachment = useCallback(async (attachment: RecordAttachment) => {
    try {
      const objectUrl = await repository.openRecordAttachment(attachment);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not open file.", "error");
    }
  }, [toast]);

  const data = { patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, attachments, diary, tasks, providers, syncMessage };

  const restoreBackupData = useCallback(async (rawBackup: unknown): Promise<{ restoredPatients: number; warnings: string[] }> => {
    const incoming = parseBackupData(rawBackup);
    const currentData: RepositoryAppData = { patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diaryEntries: diary, tasks, providers, attachments };
    const merged = mergeBackupData(currentData, incoming, currentProfile?.userId);
    setPatients(merged.data.patients);
    setLabResults(merged.data.labResults);
    setDotEntries(merged.data.dotEntries);
    setContacts(merged.data.contacts);
    setTptRecords(merged.data.tptRecords);
    setSputumFollowUps(merged.data.sputumFollowUps);
    setDiary(merged.data.diaryEntries);
    setProviders(merged.data.providers);
    setAttachments(merged.data.attachments);

    const warnings = [...merged.warnings];
    try {
      const cloudRestore = await repository.restoreAppData(merged.data, { profile: currentProfile });
      warnings.push(...cloudRestore.warnings);
    } catch (error) {
      warnings.push(`Cloud sync issue: ${error instanceof Error ? error.message : "unknown restore error"}`);
    }

    return { restoredPatients: incoming.patients.length, warnings };
  }, [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diary, tasks, providers, attachments, currentProfile]);

  const isEmailVerificationError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : "";
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    return statusCode === 403 || /verify|verification|verified|confirm/i.test(message);
  };

  const signInWithInsForge = async (email: string, password: string) => {
    if (!email || !password) { setAuthMessage("ইমেইল ও পাসওয়ার্ড দিন।"); return; }
    setAuthBusy(true); setAuthMessage("যাচাই হচ্ছে...");
    try { 
      const s = await authService.signInAndLoadProfile({ email, password }); 
      setCurrentProfile(s.profile); 
      if (!s.accessGranted) { 
        setApproved(false); 
        setAuthMessage(s.reason === "blocked" ? "Access blocked." : "Field Officer access is not active yet."); 
        return; 
      } 
      setApproved(true); 
      setPendingVerificationEmail("");
      setPendingVerificationName("");
    } catch (e) { 
      if (isEmailVerificationError(e)) {
        setPendingVerificationEmail(email);
        setAuthMessage("Email not verified. Enter the verification code from your email.");
      } else {
        setAuthMessage(e instanceof Error ? e.message : "Sign-in failed.");
      }
    } finally { 
      setAuthBusy(false); 
    }
  };
  
  const requestAccess = async (name: string, email: string, password: string) => {
    if (!name || !email || !password) { setAuthMessage("সব ফিল্ড পূরণ করুন।"); return; }
    setAuthBusy(true);
    try { 
      const s = await authService.requestAccess({ name, email, password, redirectTo: `${window.location.origin}/login` }); 
      if (s.reason === "email-verification-required") {
        setApproved(false);
        setCurrentProfile(null);
        setPendingVerificationEmail(email);
        setPendingVerificationName(name);
        setAuthMessage("Verification code sent. Enter the 6-digit code from your email.");
        return;
      }
      setCurrentProfile(s.profile); 
      setApproved(s.accessGranted); 
      setPendingVerificationEmail("");
      setPendingVerificationName("");
      setAuthMessage(s.accessGranted ? "Field Officer access active." : "Field Officer access is not active yet."); 
    } catch (e) { 
      setAuthMessage(e instanceof Error ? e.message : "Request failed."); 
    } finally { 
      setAuthBusy(false); 
    }
  };

  const verifyEmailCode = async (email: string, otp: string) => {
    if (!email || !otp) { setAuthMessage("Email and verification code are required."); return; }
    setAuthBusy(true);
    setAuthMessage("যাচাই হচ্ছে...");
    try {
      const s = await authService.verifyEmailAndLoadProfile({ email, otp, name: pendingVerificationName });
      setCurrentProfile(s.profile);
      setApproved(s.accessGranted);
      setPendingVerificationEmail("");
      setPendingVerificationName("");
      setAuthMessage(s.accessGranted ? "Email verified. Field Officer access active." : "Email verified, but Field Officer access is not active yet.");
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const resendVerification = async (email: string) => {
    if (!email) { setAuthMessage("Email is required to resend the verification code."); return; }
    setAuthBusy(true);
    try {
      await authService.resendVerificationEmail({ email, redirectTo: `${window.location.origin}/login` });
      setPendingVerificationEmail(email);
      setAuthMessage("New verification code sent.");
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : "Could not resend verification code.");
    } finally {
      setAuthBusy(false);
    }
  };
  
  const signOut = async () => { 
    setApproved(false); 
    setCurrentProfile(null); 
    setPatients([]); 
    setLabResults([]); 
    setDotEntries([]); 
    setContacts([]); 
    setTptRecords([]); 
    setSputumFollowUps([]); 
    setAttachments([]);
    setDiary([]); 
    setProviders([]); 
    await authService.signOut().catch(() => {}); 
    navigate("/login", { replace: true }); 
  };

  if (insforgeConfigError) return <main className="auth-page" style={{gridTemplateColumns:'1fr'}}><section className="auth-form-panel"><div className="auth-form-inner"><div className="auth-hero-brand" style={{justifyContent:'center'}}><div className="auth-hero-logo" style={{background:'var(--gl)',color:'var(--g)'}}>TB</div><span style={{color:'var(--ink)',fontWeight:700}}>TB-FO Assistant</span></div><h1 style={{textAlign:'center',margin:'16px 0 8px'}}>Config missing</h1><p style={{color:'var(--muted)',textAlign:'center'}}>{insforgeConfigError}</p></div></section></main>;
  if (authLoading) return <main className="auth-page" style={{gridTemplateColumns:'1fr'}}><section className="auth-form-panel"><div className="auth-form-inner" style={{textAlign:'center'}}><div className="auth-hero-brand" style={{justifyContent:'center'}}><div className="auth-hero-logo" style={{background:'var(--gl)',color:'var(--g)'}}>TB</div><span style={{color:'var(--ink)',fontWeight:700}}>TB-FO Assistant</span></div><h1 style={{margin:'16px 0 0'}}>যাচাই হচ্ছে</h1><p style={{color:'var(--muted)'}}>Loading...</p></div></section></main>;
  if (!approved && location.pathname !== "/login") return <Navigate to="/login" replace />;

  return (
    <>
      <ToastContainer items={toasts} onDismiss={dismissToast} />
      {modal ? <ConfirmModal title={modal.title} message={modal.message} danger={modal.danger} onConfirm={modal.onConfirm} onCancel={() => setModal(null)} /> : null}
      <Routes>
        <Route
          path="/login"
          element={approved ? <Navigate to="/" replace /> : (
            <Suspense fallback={<div className="route-loading">Loading...</div>}>
              <LoginPage
                authBusy={authBusy}
                authMessage={authMessage}
                verificationEmail={pendingVerificationEmail}
                onRequestAccess={requestAccess}
                onSignIn={signInWithInsForge}
                onVerifyEmail={verifyEmailCode}
                onResendVerification={resendVerification}
              />
            </Suspense>
          )}
        />
        <Route path="/*" element={
          <AppShell onNewPatient={() => navigate("/patients/new")} onSignOut={signOut} profile={currentProfile} syncMessage={syncMessage}>
            <Suspense fallback={<div className="route-loading">Loading...</div>}>
            <Routes>
              <Route index element={<DashboardPage data={data} onNavigate={(p) => navigate(p)} />} />
              <Route path="patients" element={<PatientRegistryPage patients={patients} tasks={tasks} onOpen={(id) => navigate(`/patients/${id}`)} />} />
              <Route path="patients/new" element={<PatientFormPage patients={patients} attachments={attachments} onSave={savePatient} onDelete={deletePatient} onSaveLab={saveLabResult} onSaveDot={saveDotEntry} onSaveContact={saveContact} onSaveTpt={saveTpt} onSaveSputum={saveSputum} onUploadAttachment={uploadAttachment} onOpenAttachment={openAttachment} />} />
              <Route path="patients/:patientId" element={<PatientFormPage patients={patients} labResults={labResults} dotEntries={dotEntries} contacts={contacts} tptRecords={tptRecords} sputumFollowUps={sputumFollowUps} attachments={attachments} onSave={savePatient} onDelete={deletePatient} onSaveLab={saveLabResult} onSaveDot={saveDotEntry} onSaveContact={saveContact} onSaveTpt={saveTpt} onSaveSputum={saveSputum} onUploadAttachment={uploadAttachment} onOpenAttachment={openAttachment} />} />
              <Route path="today" element={<WorklistPage tasks={tasks} patients={patients} onOpen={(id) => navigate(`/patients/${id}`)} />} />
              <Route path="diary" element={<DiaryPage diary={diary} />} />
              <Route path="reports" element={<ReportsPage data={data} onLog={(d) => { logDiary({ type: "Report Generated", details: d }); toast("Report export হয়েছে"); }} />} />
              <Route path="providers" element={<ProviderPage providers={providers} patients={patients} onSave={(p) => { const item = { ...p, id: p.id || uid("pro"), createdAt: p.createdAt || nowIso(), updatedAt: nowIso() }; setProviders((c) => [item, ...c.filter((e) => e.id !== item.id)]); runSync("Provider", () => repository.saveProvider(item)); toast("Provider সংরক্ষিত"); }} />} />
              <Route path="quality" element={<DataQualityPage patients={patients} labResults={labResults} sputumFollowUps={sputumFollowUps} tasks={tasks} onOpen={(id) => navigate(`/patients/${id}`)} />} />
              <Route path="settings" element={<SettingsPage data={data} onToast={toast} onRestoreBackup={restoreBackupData} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
          </AppShell>
        } />
      </Routes>
    </>
  );
}
