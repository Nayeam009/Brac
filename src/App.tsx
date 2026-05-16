import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { buildDiaryEntry, detectDuplicatePatient, generateWorklist, HISTORICAL_BACK_ENTRY_CUTOFF_DATE, resolvePatientDotPlan, resolvePatientTreatmentSchedule, shouldCreateLiveDiaryEntry, treatmentDayNumberForDate, withResolvedPatientEntryMetadata, TB_IP_DAYS } from "./domain/automation";
import type { ContactPerson, DiaryEntry, DotEntry, LabResult, Patient, Profile, Provider, RecordAttachment, SputumFollowUp, Task, TptRecord } from "./domain/types";
import { AppShell, ConfirmModal, ToastContainer, type ToastItem } from "./components";
import * as repository from "./services/appRepository";
import type { AppData as RepositoryAppData } from "./services/appRepository";
import {
  emptyAppData,
  enqueueSync,
  flushSyncQueue,
  loadLocalAppData,
  loadPendingAttachmentBlob,
  loadSyncQueue,
  mergeAppDataByFreshness,
  removePendingAttachmentBlob,
  saveLocalAppData,
  savePendingAttachmentBlob,
  type QueuedSyncInput,
  type QueuedSyncItem,
} from "./services/localStore";
import * as authService from "./services/authService";
import { mergeBackupData, parseBackupData } from "./services/backupService";
import { insforgeConfigError } from "./lib/insforgeClient";
import { formatDateDisplay, toLocalIsoDate } from "./lib/dateFormat";
import { getPatientHouseLocation } from "./lib/houseLocation";
import { setSentryProfile } from "./lib/sentry";

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
const DIARY_TRACKING_STORAGE_KEY = "tb-fo-diary-tracking-enabled";
const displayDateOrDash = (value?: string) => formatDateDisplay(value) || "—";
const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
const dotStatusLabel = (status?: DotEntry["status"]) => status === "done" ? "done" : status === "missed" ? "missed" : status === "supervised" ? "supervised" : "blank";
const loadDiaryTrackingEnabled = () => {
  try {
    return localStorage.getItem(DIARY_TRACKING_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

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
  const beforeLocation = getPatientHouseLocation(before.metadata);
  const afterLocation = getPatientHouseLocation(after.metadata);
  if (!beforeLocation && afterLocation) changes.push("house location added");
  else if (beforeLocation && !afterLocation) changes.push("house location cleared");
  else if (beforeLocation && afterLocation && (beforeLocation.latitude !== afterLocation.latitude || beforeLocation.longitude !== afterLocation.longitude)) changes.push("house location updated");
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
  const [diaryTrackingEnabled, setDiaryTrackingEnabled] = useState(loadDiaryTrackingEnabled);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [syncMessage, setSyncMessage] = useState("Loading data...");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const currentDataRef = useRef<RepositoryAppData>(emptyAppData());
  const syncInFlightRef = useRef(false);
  const syncRequestedRef = useRef(false);
  const localCommitChainRef = useRef<Promise<void>>(Promise.resolve());
  const historicalDotBatchRef = useRef<Record<string, { patient?: Patient; entries: Map<string, DotEntry["status"]> }>>({});
  const historicalDotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone?: ToastItem["tone"]) => {
    const id = uid("t");
    setToasts((c) => [...c, { id, message, tone }]);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((c) => c.filter((t) => t.id !== id)), []);

  const applyAppData = useCallback((next: RepositoryAppData) => {
    currentDataRef.current = next;
    setPatients(next.patients);
    setLabResults(next.labResults);
    setDotEntries(next.dotEntries);
    setContacts(next.contacts);
    setTptRecords(next.tptRecords);
    setSputumFollowUps(next.sputumFollowUps);
    setAttachments(next.attachments);
    setDiary(next.diaryEntries);
    setProviders(next.providers);
  }, []);

  const updateDiaryTracking = useCallback((enabled: boolean) => {
    setDiaryTrackingEnabled(enabled);
    try {
      localStorage.setItem(DIARY_TRACKING_STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // Local storage can be unavailable in private or restricted browser modes.
    }
  }, []);

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
    setSentryProfile(approved ? currentProfile : null);
  }, [approved, currentProfile]);

  const tasks: Task[] = useMemo(() => generateWorklist({ today: today(), patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps }), [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps]);

  useEffect(() => {
    currentDataRef.current = { patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diaryEntries: diary, tasks, providers, attachments };
  }, [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diary, tasks, providers, attachments]);

  const performQueuedSync = useCallback(async (item: QueuedSyncItem) => {
    if (!currentProfile) throw new Error("No active Field Officer profile.");
    if (item.operation === "delete" && item.entity === "patient") {
      await repository.deletePatient(String(item.payload || item.entityKey));
      return;
    }
    if (item.entity === "patient") await repository.savePatient(item.payload as Patient);
    else if (item.entity === "lab") await repository.saveLabResult(item.payload as LabResult);
    else if (item.entity === "dot") await repository.saveDotEntry(item.payload as DotEntry);
    else if (item.entity === "sputum") await repository.saveSputumFollowUp(item.payload as SputumFollowUp);
    else if (item.entity === "contact") await repository.saveContact(item.payload as ContactPerson);
    else if (item.entity === "tpt") await repository.saveTptRecord(item.payload as TptRecord);
    else if (item.entity === "provider") await repository.saveProvider(item.payload as Provider);
    else if (item.entity === "diary") await repository.saveDiaryEntry(item.payload as DiaryEntry);
    else if (item.entity === "task") await repository.saveTask(item.payload as Task);
    else if (item.entity === "attachment") {
      const attachment = item.payload as RecordAttachment;
      if (item.operation === "upload") {
        const blobKey = item.blobKey || attachment.id;
        const file = await loadPendingAttachmentBlob(currentProfile.userId, blobKey);
        if (!file) throw new Error(`Pending file missing for ${attachment.fileName}.`);
        const uploaded = await repository.uploadRecordAttachment({
          patientId: attachment.recordId,
          file,
          profile: currentProfile,
          attachmentId: attachment.id,
          createdAt: attachment.createdAt,
        });
        const next = { ...currentDataRef.current, attachments: [uploaded, ...currentDataRef.current.attachments.filter((entry) => entry.id !== uploaded.id)] };
        await saveLocalAppData(currentProfile.userId, next);
        applyAppData(next);
        await removePendingAttachmentBlob(currentProfile.userId, blobKey);
      } else {
        await repository.saveRecordAttachment(attachment);
      }
    }
  }, [applyAppData, currentProfile]);

  const syncQueuedData = useCallback(async () => {
    if (!approved || !currentProfile) return;
    if (syncInFlightRef.current) {
      syncRequestedRef.current = true;
      return;
    }
    syncInFlightRef.current = true;
    setSyncMessage("Saved locally · syncing");
    try {
      const result = await flushSyncQueue(currentProfile.userId, performQueuedSync);
      setPendingSyncCount(result.pending);
      if (result.pending && result.failed === 0) syncRequestedRef.current = true;
      setSyncMessage(result.pending ? `Saved locally · ${result.pending} cloud retry needed` : "All synced");
    } finally {
      syncInFlightRef.current = false;
      if (syncRequestedRef.current) {
        syncRequestedRef.current = false;
        window.setTimeout(() => { void syncQueuedData(); }, 0);
      }
    }
  }, [approved, currentProfile, performQueuedSync]);

  const commitAppData = useCallback(async (next: RepositoryAppData, syncItems: QueuedSyncInput[] = [], message?: string, tone?: ToastItem["tone"]) => {
    const previousData = currentDataRef.current;
    currentDataRef.current = next;
    const runCommit = async () => {
    if (!currentProfile) {
      applyAppData(next);
      if (message) toast(message, tone);
      return;
    }

    try {
      await saveLocalAppData(currentProfile.userId, next);
    } catch (error) {
      currentDataRef.current = previousData;
      toast(error instanceof Error ? `Device save failed: ${error.message}` : "Device save failed.", "error");
      throw error;
    }

    let queueFailed = false;
    for (const item of syncItems) {
      try {
        await enqueueSync(currentProfile.userId, item);
      } catch {
        queueFailed = true;
      }
    }
    applyAppData(next);
    const pending = await loadSyncQueue(currentProfile.userId);
    setPendingSyncCount(pending.length);
    setSyncMessage(pending.length ? `Saved locally · ${pending.length} pending` : "Saved on this device");
    if (message) toast(message, tone);
    if (queueFailed) toast("Saved locally, but cloud retry queue could not be updated. Export a backup before closing.", "warning");
    void syncQueuedData();
    };
    const queuedCommit = localCommitChainRef.current.then(runCommit, runCommit);
    localCommitChainRef.current = queuedCommit.catch(() => {});
    await queuedCommit;
  }, [applyAppData, currentProfile, syncQueuedData, toast]);

  useEffect(() => {
    if (!approved || !currentProfile) return;
    let cancelled = false;
    const profileId = currentProfile.userId;

    (async () => {
      const localData = await loadLocalAppData(profileId);
      if (localData && !cancelled) {
        applyAppData(localData);
        const pending = await loadSyncQueue(profileId);
        setPendingSyncCount(pending.length);
        setSyncMessage(pending.length ? `Saved locally · ${pending.length} pending` : "Saved locally");
      }

      try {
        const cloudData = await repository.loadAppData({ profile: currentProfile });
        const merged = mergeAppDataByFreshness(localData, cloudData);
        await saveLocalAppData(profileId, merged);
        if (!cancelled) {
          applyAppData(merged);
          const pending = await loadSyncQueue(profileId);
          setPendingSyncCount(pending.length);
          setSyncMessage(pending.length ? `Saved locally · ${pending.length} pending` : cloudData.patients.length ? "Data loaded" : "No records yet");
          void syncQueuedData();
        }
      } catch (error) {
        if (!cancelled) {
          setSyncMessage(localData ? "Saved locally · cloud retry needed" : `Read issue · ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [approved, applyAppData, currentProfile, syncQueuedData]);

  useEffect(() => {
    window.addEventListener("online", syncQueuedData);
    return () => window.removeEventListener("online", syncQueuedData);
  }, [syncQueuedData]);

  const logDiary = useCallback((entry: Omit<Parameters<typeof buildDiaryEntry>[0], "now">) => {
    if (!diaryTrackingEnabled) return;
    const d = buildDiaryEntry({ ...entry, now: new Date() });
    d.userId = currentProfile?.userId;
    d.userName = currentProfile?.name;
    const next = { ...currentDataRef.current, diaryEntries: [d, ...currentDataRef.current.diaryEntries.filter((item) => item.id !== d.id)] };
    void commitAppData(next, [{ entity: "diary", operation: "upsert", entityKey: d.id, payload: d }]);
  }, [commitAppData, currentProfile, diaryTrackingEnabled]);

  const flushHistoricalDotDiary = useCallback(() => {
    const batches = historicalDotBatchRef.current;
    historicalDotBatchRef.current = {};
    historicalDotTimerRef.current = null;
    if (!diaryTrackingEnabled) return;

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
  }, [diaryTrackingEnabled, logDiary]);

  const queueHistoricalDotDiary = useCallback((patient: Patient | undefined, date: string, status: DotEntry["status"]) => {
    if (!diaryTrackingEnabled) return;
    const key = patient?.id || "unknown";
    const batch = historicalDotBatchRef.current[key] || { patient, entries: new Map<string, DotEntry["status"]>() };
    batch.patient = patient || batch.patient;
    batch.entries.set(date, status);
    historicalDotBatchRef.current[key] = batch;

    if (historicalDotTimerRef.current) clearTimeout(historicalDotTimerRef.current);
    historicalDotTimerRef.current = setTimeout(flushHistoricalDotDiary, 900);
  }, [diaryTrackingEnabled, flushHistoricalDotDiary]);

  useEffect(() => () => {
    if (historicalDotTimerRef.current) clearTimeout(historicalDotTimerRef.current);
  }, []);

  useEffect(() => {
    if (diaryTrackingEnabled) return;
    historicalDotBatchRef.current = {};
    if (historicalDotTimerRef.current) {
      clearTimeout(historicalDotTimerRef.current);
      historicalDotTimerRef.current = null;
    }
  }, [diaryTrackingEnabled]);

  const savePatient = useCallback((draft: Patient) => {
    const dupes = detectDuplicatePatient(draft, patients, draft.id);
    const treatmentSchedule = resolvePatientTreatmentSchedule(draft);
    const existing = patients.find((p) => p.id === draft.id);
    const p = withResolvedPatientEntryMetadata({ ...draft, ipEndDate: treatmentSchedule.ipEndDate || draft.ipEndDate, treatmentEndDate: treatmentSchedule.treatmentEndDate || draft.treatmentEndDate, id: draft.id || uid("pat"), name: draft.name || "নামহীন রোগী", ownerId: draft.ownerId || currentProfile?.userId, createdAt: draft.createdAt || nowIso(), updatedAt: nowIso(), metadata: { ...(draft.metadata || {}), duplicateIssues: dupes } } as Patient, HISTORICAL_BACK_ENTRY_CUTOFF_DATE);
    const next = { ...currentDataRef.current, patients: existing ? currentDataRef.current.patients.map((x) => x.id === p.id ? p : x) : [p, ...currentDataRef.current.patients] };
    void commitAppData(next, [{ entity: "patient", operation: "upsert", entityKey: p.id, payload: p }], existing ? "রেকর্ড সংরক্ষিত হয়েছে" : "নতুন রোগী নিবন্ধিত হয়েছে");
    logDiary({ type: existing ? "Record Updated" : "New Patient", patient: p, details: summarizePatientSave(existing, p) });
    navigate(`/patients/${p.id}`);
  }, [patients, currentProfile, commitAppData, logDiary, navigate]);

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
    const next = { ...currentDataRef.current, labResults: [item, ...currentDataRef.current.labResults.filter((e) => e.id !== item.id)] };
    void commitAppData(next, [{ entity: "lab", operation: "upsert", entityKey: item.id, payload: item }], "Lab result সংরক্ষিত");
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "Lab Updated", patient: p, details: `${item.testType}${item.testDate ? ` ${formatDateDisplay(item.testDate)}` : ""}: ${item.result || "—"}${item.labId ? ` · Lab ${item.labId}` : ""}` });
  }, [patients, commitAppData, logDiary]);

  const saveDotEntry = useCallback((dot: DotEntry) => {
    const item = { ...dot, id: dot.id || uid("dot"), updatedBy: dot.updatedBy || currentProfile?.userId, updatedAt: nowIso() };
    const next = { ...currentDataRef.current, dotEntries: [item, ...currentDataRef.current.dotEntries.filter((e) => !(e.patientId === item.patientId && e.date === item.date))] };
    void commitAppData(next, [{ entity: "dot", operation: "upsert", entityKey: `${item.patientId}:${item.date}`, payload: item }]);
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
  }, [patients, currentProfile, commitAppData, logDiary, queueHistoricalDotDiary]);

  const saveContact = useCallback((contact: ContactPerson) => {
    const item = { ...contact, id: contact.id || uid("ci"), createdAt: contact.createdAt || nowIso(), updatedAt: nowIso(), isChild: Boolean(contact.age != null && contact.age > 0 && contact.age < 5), isSymptomatic: Boolean(contact.symptomCode && contact.symptomCode !== "5"), tptEligible: contact.outcomeCode === "4" || contact.tptEligible };
    const next = { ...currentDataRef.current, contacts: [item, ...currentDataRef.current.contacts.filter((e) => e.id !== item.id)] };
    void commitAppData(next, [{ entity: "contact", operation: "upsert", entityKey: item.id, payload: item }], "Contact সংরক্ষিত");
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "CI Updated", patient: p, details: `CI contact: ${item.name}${item.result ? ` · result ${item.result}` : ""}${item.followUpDate ? ` · follow-up ${formatDateDisplay(item.followUpDate)}` : ""}` });
  }, [patients, commitAppData, logDiary]);

  const saveTpt = useCallback((record: TptRecord) => {
    const item = { ...record, id: record.id || uid("tpt"), createdAt: record.createdAt || nowIso(), updatedAt: nowIso() };
    const next = { ...currentDataRef.current, tptRecords: [item, ...currentDataRef.current.tptRecords.filter((e) => e.id !== item.id)] };
    void commitAppData(next, [{ entity: "tpt", operation: "upsert", entityKey: item.id, payload: item }], "TPT সংরক্ষিত");
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "TPT Updated", patient: p, details: `TPT: ${item.name} (${item.status || "—"})${item.startDate ? ` · start ${formatDateDisplay(item.startDate)}` : ""}${item.expectedEndDate ? ` · end ${formatDateDisplay(item.expectedEndDate)}` : ""}` });
  }, [patients, commitAppData, logDiary]);

  const saveSputum = useCallback((s: SputumFollowUp) => {
    const item = { ...s, id: s.id || uid("sp"), createdAt: s.createdAt || nowIso(), updatedAt: nowIso() };
    const next = { ...currentDataRef.current, sputumFollowUps: [item, ...currentDataRef.current.sputumFollowUps.filter((e) => !(e.patientId === item.patientId && e.stage === item.stage))] };
    void commitAppData(next, [{ entity: "sputum", operation: "upsert", entityKey: `${item.patientId}:${item.stage}`, payload: item }], "Sputum follow-up সংরক্ষিত");
    const p = patients.find((x) => x.id === item.patientId);
    logDiary({ type: "Sputum Updated", patient: p, details: `${item.stage} sputum${item.testDate ? ` ${formatDateDisplay(item.testDate)}` : ""}: microscopy ${item.microscopyResult || item.microscopy || "—"} · GeneXpert ${item.geneXpertResult || item.xpertTruenat || "—"}` });
  }, [patients, commitAppData, logDiary]);

  const uploadAttachment = useCallback(async (patientId: string, file: File) => {
    if (!currentProfile) {
      const message = "Please sign in again before uploading.";
      toast(message, "error");
      throw new Error(message);
    }
    try {
      const attachmentId = uid("att");
      const blobKey = attachmentId;
      const attachment: RecordAttachment = {
        id: attachmentId,
        recordType: "patient",
        recordId: patientId,
        fileName: file.name || "attachment",
        fileType: file.type,
        fileSize: file.size,
        bucket: "record-attachments",
        storageKey: `pending://${currentProfile.userId}/${patientId}/${attachmentId}`,
        url: "",
        uploadedBy: currentProfile.userId,
        createdAt: nowIso(),
      };
      await savePendingAttachmentBlob(currentProfile.userId, blobKey, file);
      const next = { ...currentDataRef.current, attachments: [attachment, ...currentDataRef.current.attachments.filter((item) => item.id !== attachment.id)] };
      await commitAppData(next, [{ entity: "attachment", operation: "upload", entityKey: attachment.id, payload: attachment, blobKey }], "File saved on this device");
      const p = patients.find((x) => x.id === patientId);
      logDiary({ type: "Record Updated", patient: p, details: `File attached: ${attachment.fileName}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      toast(message, "error");
      throw error;
    }
  }, [commitAppData, currentProfile, patients, logDiary, toast]);

  const openAttachment = useCallback(async (attachment: RecordAttachment) => {
    try {
      let objectUrl = "";
      if (attachment.storageKey.startsWith("pending://") && currentProfile) {
        const file = await loadPendingAttachmentBlob(currentProfile.userId, attachment.id);
        if (!file) throw new Error("Pending file is not available on this device.");
        objectUrl = URL.createObjectURL(file);
      } else {
        objectUrl = await repository.openRecordAttachment(attachment);
      }
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
  }, [currentProfile, toast]);

  const data = { patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, attachments, diary, tasks, providers, syncMessage };

  const restoreBackupData = useCallback(async (rawBackup: unknown): Promise<{ restoredPatients: number; warnings: string[] }> => {
    const incoming = parseBackupData(rawBackup);
    const currentData: RepositoryAppData = { patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diaryEntries: diary, tasks, providers, attachments };
    const merged = mergeBackupData(currentData, incoming, currentProfile?.userId);
    const warnings = [...merged.warnings];
    const syncItems: QueuedSyncInput[] = [
      ...merged.data.patients.map((item) => ({ entity: "patient" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.labResults.map((item) => ({ entity: "lab" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.dotEntries.map((item) => ({ entity: "dot" as const, operation: "upsert" as const, entityKey: `${item.patientId}:${item.date}`, payload: item })),
      ...merged.data.contacts.map((item) => ({ entity: "contact" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.tptRecords.map((item) => ({ entity: "tpt" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.sputumFollowUps.map((item) => ({ entity: "sputum" as const, operation: "upsert" as const, entityKey: `${item.patientId}:${item.stage}`, payload: item })),
      ...merged.data.diaryEntries.map((item) => ({ entity: "diary" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.tasks.map((item) => ({ entity: "task" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.providers.map((item) => ({ entity: "provider" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
      ...merged.data.attachments.map((item) => ({ entity: "attachment" as const, operation: "upsert" as const, entityKey: item.id, payload: item })),
    ];
    await commitAppData(merged.data, syncItems);
    warnings.push(`Cloud sync queued for ${syncItems.length} restored records.`);

    return { restoredPatients: incoming.patients.length, warnings };
  }, [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diary, tasks, providers, attachments, currentProfile, commitAppData]);

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
          <AppShell onNewPatient={() => navigate("/patients/new")} onSignOut={signOut} profile={currentProfile} syncMessage={syncMessage} diaryTrackingEnabled={diaryTrackingEnabled} pendingSyncCount={pendingSyncCount} onRetrySync={syncQueuedData}>
            <Suspense fallback={<div className="route-loading">Loading...</div>}>
            <Routes>
              <Route index element={<DashboardPage data={data} onNavigate={(p) => navigate(p)} />} />
              <Route path="patients" element={<PatientRegistryPage patients={patients} tasks={tasks} onOpen={(id) => navigate(`/patients/${id}`)} />} />
              <Route path="patients/new" element={<PatientFormPage patients={patients} attachments={attachments} onSave={savePatient} onDelete={deletePatient} onSaveLab={saveLabResult} onSaveDot={saveDotEntry} onSaveContact={saveContact} onSaveTpt={saveTpt} onSaveSputum={saveSputum} onUploadAttachment={uploadAttachment} onOpenAttachment={openAttachment} />} />
              <Route path="patients/:patientId" element={<PatientFormPage patients={patients} labResults={labResults} dotEntries={dotEntries} contacts={contacts} tptRecords={tptRecords} sputumFollowUps={sputumFollowUps} attachments={attachments} onSave={savePatient} onDelete={deletePatient} onSaveLab={saveLabResult} onSaveDot={saveDotEntry} onSaveContact={saveContact} onSaveTpt={saveTpt} onSaveSputum={saveSputum} onUploadAttachment={uploadAttachment} onOpenAttachment={openAttachment} />} />
              <Route path="today" element={<WorklistPage tasks={tasks} patients={patients} onOpen={(id) => navigate(`/patients/${id}`)} />} />
              <Route path="diary" element={<DiaryPage diary={diary} diaryTrackingEnabled={diaryTrackingEnabled} onDiaryTrackingChange={updateDiaryTracking} />} />
              <Route path="reports" element={<ReportsPage data={data} onLog={(d) => { logDiary({ type: "Report Generated", details: d }); toast("Report export হয়েছে"); }} />} />
              <Route path="providers" element={<ProviderPage providers={providers} patients={patients} onSave={(p) => { const item = { ...p, id: p.id || uid("pro"), createdAt: p.createdAt || nowIso(), updatedAt: nowIso() }; const next = { ...currentDataRef.current, providers: [item, ...currentDataRef.current.providers.filter((e) => e.id !== item.id)] }; void commitAppData(next, [{ entity: "provider", operation: "upsert", entityKey: item.id, payload: item }], "Provider সংরক্ষিত"); }} />} />
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
