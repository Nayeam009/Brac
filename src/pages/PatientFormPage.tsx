import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, ExternalLink, FileText, FlaskConical, LocateFixed, MapPin, Microscope, Navigation, Plus, Printer, Save, ScanLine, Trash2, Upload } from "lucide-react";
import type { ContactPerson, DotEntry, LabResult, Patient, RecordAttachment, SputumFollowUp, TptRecord } from "../domain/types";
import { calculateDrugDosePlan, calculateTreatmentEndDateFromMonths, calculateTptEndDate, detectDuplicatePatient, DRUG_REGIMENS, HISTORICAL_BACK_ENTRY_CUTOFF_DATE, inferTreatmentLengthMonths, resolvePatientDotPlan, resolvePatientEntryMode, resolvePatientTreatmentSchedule, TREATMENT_LENGTH_MONTH_OPTIONS, type PatientEntryMode } from "../domain/automation";
import { AlertCard, DateInput, DotGrid, PageHeader, PhaseTimeline, RadioChips, SectionCard, StatusBadge } from "../components";
import { formatDateDisplay, formatDateTimeDisplay, toLocalIsoDate, toLocalIsoMonth } from "../lib/dateFormat";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsPointUrl, formatHouseCoordinates, formatLocationAccuracy, getPatientHouseLocation, parseHouseLocationInput, type PatientHouseLocation, withPatientHouseLocation, withoutPatientHouseLocation } from "../lib/houseLocation";

type Props = {
  patients: Patient[]; labResults?: LabResult[]; dotEntries?: DotEntry[]; contacts?: ContactPerson[];
  tptRecords?: TptRecord[]; sputumFollowUps?: SputumFollowUp[]; attachments?: RecordAttachment[];
  onSave: (p: Patient) => void; onDelete: (id: string) => void;
  onSaveLab: (l: LabResult) => void; onSaveDot: (d: DotEntry) => void;
  onSaveContact: (c: ContactPerson) => void; onSaveTpt: (t: TptRecord) => void; onSaveSputum: (s: SputumFollowUp) => void;
  onUploadAttachment?: (patientId: string, file: File) => Promise<void> | void;
  onOpenAttachment?: (attachment: RecordAttachment) => Promise<void> | void;
};

const now = () => new Date().toISOString();
const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 104857.6) / 10} MB`;
};
const sputumStages = ["2M", "5M", "6M"] as const;
type SputumStage = (typeof sputumStages)[number];
type PatientClinicalMetadata = {
  bcgScar?: string;
  hivStatus?: string;
  cptStartDate?: string;
  artStartDate?: string;
  covidStatus?: string;
  malariaStatus?: string;
  treatmentHistoryNote?: string;
};
type SputumDraft = Partial<Omit<SputumFollowUp, "stage">> & { stage?: SputumFollowUp["stage"] };

const getClinicalMetadata = (metadata?: Record<string, unknown>): PatientClinicalMetadata => {
  const clinical = metadata?.clinical;
  return clinical && typeof clinical === "object" ? clinical as PatientClinicalMetadata : {};
};
const isTreatmentLengthOption = (value: number) => (TREATMENT_LENGTH_MONTH_OPTIONS as readonly number[]).includes(value);
const treatmentLengthFromMetadata = (metadata?: Record<string, unknown>) => {
  const value = metadata?.treatmentLengthMonths;
  return typeof value === "number" && isTreatmentLengthOption(value) ? value : undefined;
};

export function PatientFormPage({ patients, labResults = [], dotEntries = [], contacts = [], tptRecords = [], sputumFollowUps = [], attachments = [], onSave, onDelete, onSaveLab, onSaveDot, onSaveContact, onSaveTpt, onSaveSputum, onUploadAttachment, onOpenAttachment }: Props) {
  const { patientId } = useParams();
  const existing = patients.find((p) => p.id === patientId);
  const blank: Patient = useMemo(() => ({ id: "", name: "", phase: "Pre-treatment", tbType: "Pulmonary", confirmationMethod: "BC", createdAt: now(), updatedAt: now() }), []);
  const [form, setForm] = useState<Patient>(existing || blank);
  const [dotMonth, setDotMonth] = useState(toLocalIsoMonth());
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [sputumDrafts, setSputumDrafts] = useState<Record<string, SputumDraft>>({});

  useEffect(() => { if (existing) setForm(existing); else if (!patientId || patientId === "new") setForm(blank); }, [existing, patientId, blank]);
  const houseLocation = getPatientHouseLocation(form.metadata);
  useEffect(() => {
    setManualLatitude(houseLocation ? String(houseLocation.latitude) : "");
    setManualLongitude(houseLocation ? String(houseLocation.longitude) : "");
  }, [houseLocation?.latitude, houseLocation?.longitude]);

  const u = (key: keyof Patient, val: string | number) => setForm((c) => {
    if (key === "treatmentStartDate" && typeof val === "string") {
      return { ...c, treatmentStartDate: val };
    }
    if (key === "treatmentEndDate" && typeof val === "string") {
      const startDate = c.drugStartDate;
      const inferredMonths = inferTreatmentLengthMonths(startDate, val);
      const metadata = { ...(c.metadata || {}) };
      if (inferredMonths) {
        metadata.treatmentLengthMonths = inferredMonths;
        delete metadata.treatmentEndMode;
      } else {
        delete metadata.treatmentLengthMonths;
        metadata.treatmentEndMode = "custom";
      }
      return { ...c, treatmentEndDate: val, metadata };
    }
    return { ...c, [key]: val };
  });
  const selectedTreatmentLengthMonths = (current: Patient, startDate?: string, endDate?: string) =>
    treatmentLengthFromMetadata(current.metadata) || inferTreatmentLengthMonths(startDate, endDate) || 6;
  const updateDrugStartDate = (val: string) => {
    setForm((c) => {
      const startDate = val;
      const months = selectedTreatmentLengthMonths(c, startDate, c.treatmentEndDate);
      return {
        ...c,
        drugStartDate: val,
        treatmentEndDate: startDate ? calculateTreatmentEndDateFromMonths(startDate, months) : c.treatmentEndDate,
        metadata: { ...(c.metadata || {}), treatmentLengthMonths: months, treatmentEndMode: undefined },
      };
    });
    if (val) setDotMonth(val.slice(0, 7));
  };
  const updateTreatmentLengthMonths = (months: number) => setForm((c) => {
    const normalizedMonths = isTreatmentLengthOption(months) ? months : 6;
    const startDate = c.drugStartDate;
    return {
      ...c,
      treatmentEndDate: startDate ? calculateTreatmentEndDateFromMonths(startDate, normalizedMonths) : c.treatmentEndDate,
      metadata: { ...(c.metadata || {}), treatmentLengthMonths: normalizedMonths, treatmentEndMode: undefined },
    };
  });
  const updateTreatmentEndDate = (val: string) => setForm((c) => {
    const startDate = c.drugStartDate;
    const inferredMonths = inferTreatmentLengthMonths(startDate, val);
    const metadata = { ...(c.metadata || {}) };
    if (inferredMonths) {
      metadata.treatmentLengthMonths = inferredMonths;
      delete metadata.treatmentEndMode;
    } else {
      delete metadata.treatmentLengthMonths;
      metadata.treatmentEndMode = "custom";
    }
    return { ...c, treatmentEndDate: val, metadata };
  });
  const updateClinical = (key: keyof PatientClinicalMetadata, val: string) => setForm((c) => {
    const clinical = getClinicalMetadata(c.metadata);
    return { ...c, metadata: { ...(c.metadata || {}), clinical: { ...clinical, [key]: val } } };
  });
  const entryModeInfo = resolvePatientEntryMode(form, HISTORICAL_BACK_ENTRY_CUTOFF_DATE);
  const updateEntryMode = (entryMode: PatientEntryMode) => setForm((c) => ({
    ...c,
    metadata: {
      ...(c.metadata || {}),
      entryMode,
      entryModeSource: "manual",
      historicalCutoffDate: HISTORICAL_BACK_ENTRY_CUTOFF_DATE,
      historicalReason: entryMode === "historical" ? `Marked as previous patient data before ${formatDateDisplay(HISTORICAL_BACK_ENTRY_CUTOFF_DATE)}` : undefined,
    },
  }));
  const dupes = detectDuplicatePatient(form, patients, form.id);
  const pLabs = labResults.filter((l) => l.patientId === existing?.id);
  const pContacts = contacts.filter((c) => c.patientId === existing?.id);
  const pTpt = tptRecords.filter((t) => t.patientId === existing?.id);
  const pSputum = sputumFollowUps.filter((s) => s.patientId === existing?.id);
  const pAttachments = attachments.filter((a) => a.recordType === "patient" && a.recordId === existing?.id);
  const isExtraPulmonary = form.tbType === "Extra-pulmonary";
  const treatmentSchedule = resolvePatientTreatmentSchedule(form);
  const sputumDueDates = treatmentSchedule.sputumDueDates;
  const activeSputumStages = sputumStages.filter((stage) => Boolean(sputumDueDates?.[stage]));
  const hasScheduleStart = Boolean(form.drugStartDate);
  const drugs = form.regimenType ? DRUG_REGIMENS[form.regimenType] : null;
  const dosePlan = calculateDrugDosePlan(form.regimenType, form.weightKg, form.phase);
  const dotPlan = resolvePatientDotPlan(form);
  const dotPlanStartDate = dotPlan.startDate;
  const dotPlanEndDate = dotPlan.endDate;
  const treatmentLengthMonths = treatmentLengthFromMetadata(form.metadata) || inferTreatmentLengthMonths(dotPlanStartDate, treatmentSchedule.treatmentEndDate) || 6;
  const treatmentLengthDays = treatmentLengthMonths * 30;
  const regimenOptions = Object.keys(DRUG_REGIMENS).filter((key) => !key.includes("—"));
  if (form.regimenType && !regimenOptions.includes(form.regimenType)) regimenOptions.push(form.regimenType);
  const clinical = getClinicalMetadata(form.metadata);
  const buildPatientForSave = (draft: Patient) => {
    const schedule = resolvePatientTreatmentSchedule(draft);
    const metadata = { ...(draft.metadata || {}) };
    if (metadata.treatmentEndMode === undefined) delete metadata.treatmentEndMode;
    return { ...draft, ipEndDate: schedule.ipEndDate || draft.ipEndDate, treatmentEndDate: schedule.treatmentEndDate || draft.treatmentEndDate, metadata };
  };
  const savePatientDraft = (draft: Patient) => onSave(buildPatientForSave(draft));
  const handleSave = () => {
    savePatientDraft(form);
  };

  const handleAttachmentUpload = async (file?: File) => {
    if (!existing || !file || !onUploadAttachment) return;
    setAttachmentBusy(true);
    setAttachmentMessage("");
    try {
      await onUploadAttachment(existing.id, file);
      setAttachmentMessage(`${file.name} uploaded.`);
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setAttachmentBusy(false);
    }
  };
  const commitHouseLocation = (location?: PatientHouseLocation) => {
    if (!existing) return;
    const next = {
      ...form,
      metadata: location ? withPatientHouseLocation(form.metadata, location) : withoutPatientHouseLocation(form.metadata),
    };
    setForm(next);
    savePatientDraft(next);
    setLocationMessage(location ? "House location saved." : "House location cleared.");
  };
  const handleUseCurrentGps = () => {
    if (!existing) return;
    if (!("geolocation" in navigator)) {
      setLocationMessage("GPS is not available in this browser.");
      return;
    }
    setLocationBusy(true);
    setLocationMessage("Getting GPS location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        commitHouseLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: now(),
          source: "gps",
        });
        setLocationBusy(false);
      },
      (error) => {
        const message = error.code === 1
          ? "GPS permission denied. Allow location access or enter the point manually."
          : error.code === 3
            ? "GPS timed out. Try again outside or enter the point manually."
            : "Could not read GPS location. Try again or enter the point manually.";
        setLocationMessage(message);
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const handleManualLocationSave = () => {
    const parsed = parseHouseLocationInput(manualLatitude, manualLongitude);
    if ("error" in parsed) {
      setLocationMessage(parsed.error);
      return;
    }
    commitHouseLocation({
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      capturedAt: now(),
      source: "manual",
    });
  };
  const copyLocationLink = async () => {
    if (!houseLocation) return;
    if (!navigator.clipboard?.writeText) {
      setLocationMessage("Copy is not available in this browser.");
      return;
    }
    await navigator.clipboard.writeText(buildGoogleMapsPointUrl(houseLocation));
    setLocationMessage("Google Maps link copied.");
  };

  const startTpt = () => {
    if (!existing) return;
    const startDate = toLocalIsoDate();
    onSaveTpt({
      id: "",
      patientId: existing.id,
      name: "TPT Contact",
      status: "Active",
      regimen: "3HR",
      startDate,
      expectedEndDate: calculateTptEndDate(startDate, "3HR"),
      createdAt: now(),
      updatedAt: now(),
    });
  };

  const sputumDraftFor = (stage: SputumStage, dueDate: string): SputumDraft => {
    const record = pSputum.find((s) => s.stage === stage);
    return { stage, dueDate, ...(record || {}), ...(sputumDrafts[stage] || {}) };
  };
  const updateSputumDraft = (stage: SputumStage, patch: SputumDraft) =>
    setSputumDrafts((current) => ({ ...current, [stage]: { ...(current[stage] || {}), stage, ...patch } }));

  // Lab form state
  const [labForm, setLabForm] = useState({ testType: "GeneXpert" as string, labId: "", testDate: toLocalIsoDate(), result: "", quantity: "", scantyCount: "", notes: "" });
  const labTypeCards = [
    { value: "GeneXpert", title: "GeneXpert / Truenat", helper: "MTB and Rif resistance result", icon: <FlaskConical size={18} /> },
    { value: "Microscopy", title: "Microscopy (Smear)", helper: "AFB grade and scanty count", icon: <Microscope size={18} /> },
    { value: "X-ray", title: "X-ray & other", helper: "X-ray, culture, or supporting tests", icon: <ScanLine size={18} /> },
  ];
  const activeLabCard = labTypeCards.find((card) => card.value === labForm.testType || (card.value === "GeneXpert" && labForm.testType === "Truenat")) || labTypeCards[0];
  // Contact form state
  const [ciName, setCiName] = useState(""); const [ciAge, setCiAge] = useState(""); const [ciSex, setCiSex] = useState(""); const [ciRel, setCiRel] = useState(""); const [ciSym, setCiSym] = useState("");
  const [ciDate, setCiDate] = useState(""); const [ciPhone, setCiPhone] = useState(""); const [ciReferred, setCiReferred] = useState(""); const [ciInvestigation, setCiInvestigation] = useState(""); const [ciResult, setCiResult] = useState(""); const [ciOutcome, setCiOutcome] = useState(""); const [ciTrOrTpt, setCiTrOrTpt] = useState(""); const [ciFollowUp, setCiFollowUp] = useState("");

  return (
    <>
      <PageHeader
        title={existing ? `${existing.name} · ${existing.tr || "TR নেই"}` : "নতুন রোগীর রেকর্ড"}
        subtitle="TB-01 ডিজিটাল রেকর্ড"
        action={<div className="badge-row">
          {existing && <button className="ghost-button" type="button" onClick={() => window.print()}><Printer size={16} /></button>}
          <button className="primary-action" type="button" onClick={handleSave}><Save size={18} /> Save</button>
        </div>}
      />

      {dupes.length > 0 && <AlertCard level="high" message={`⚠ সম্ভাব্য duplicate: ${dupes.join(", ")}। যাচাই করুন।`} />}
      {existing && <PhaseTimeline phase={existing.phase || "Pre-treatment"} />}

      <div className="form-layout">
        {/* ক — Patient Identity */}
        <SectionCard title="ক — রোগীর পরিচয় ও ঠিকানা" tone="success">
          <div className={`entry-mode-panel ${entryModeInfo.entryMode}`}>
            <div>
              <p className="form-subtitle">Entry mode</p>
              <h4>{entryModeInfo.entryMode === "historical" ? "Previous patient data" : "Live patient follow-up"}</h4>
              <p>Cutoff date: {formatDateDisplay(entryModeInfo.historicalCutoffDate)}. Previous patient data saves normally, but old DOT/history updates are logged quietly.</p>
              {entryModeInfo.historicalReason && <small>{entryModeInfo.historicalReason}</small>}
            </div>
            <div className="entry-mode-actions">
              <StatusBadge tone={entryModeInfo.entryModeSource === "manual" ? "warning" : "info"}>{entryModeInfo.entryModeSource === "manual" ? "Manual" : "Auto"}</StatusBadge>
              <RadioChips
                options={[{ value: "live", label: "Live patient" }, { value: "historical", label: "Previous patient" }]}
                value={entryModeInfo.entryMode}
                onChange={(v) => updateEntryMode(v as PatientEntryMode)}
              />
            </div>
          </div>
          <div className="field-grid">
            <label>TR / নিবন্ধন নং<input value={form.tr || ""} onChange={(e) => u("tr", e.target.value)} /></label>
            <label>DOTS Plus No<input value={form.dotsNo || ""} onChange={(e) => u("dotsNo", e.target.value)} /></label>
            <label>e-TB Manager ID<input value={form.etbId || ""} onChange={(e) => u("etbId", e.target.value)} /></label>
            <label>Registration date<DateInput value={form.registrationDate || ""} onChange={(v) => u("registrationDate", v)} /></label>
            <label>রোগীর পূর্ণ নাম<input value={form.name} onChange={(e) => u("name", e.target.value)} /></label>
            <label>বয়স<input type="number" value={form.age || ""} onChange={(e) => u("age", Number(e.target.value))} /></label>
            <label>লিঙ্গ<select value={form.sex || ""} onChange={(e) => u("sex", e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            <label>মোবাইল নম্বর<input value={form.phone || ""} onChange={(e) => u("phone", e.target.value)} /></label>
            <label>পিতার নাম<input value={form.fatherName || ""} onChange={(e) => u("fatherName", e.target.value)} /></label>
            <label>মাতার নাম<input value={form.motherName || ""} onChange={(e) => u("motherName", e.target.value)} /></label>
            <label>ওয়ার্ড<input value={form.ward || ""} onChange={(e) => u("ward", e.target.value)} /></label>
            <label>ইউনিয়ন<input value={form.union || ""} onChange={(e) => u("union", e.target.value)} /></label>
            <label>উপজেলা<input value={form.upazila || ""} onChange={(e) => u("upazila", e.target.value)} /></label>
            <label>জেলা<input value={form.district || ""} onChange={(e) => u("district", e.target.value)} /></label>
            <label className="wide">বিস্তারিত ঠিকানা<textarea value={form.address || ""} onChange={(e) => u("address", e.target.value)} /></label>
          </div>
        </SectionCard>

        {/* খ — DOTS & SS */}
        <SectionCard title="খ — DOTS কেন্দ্র ও SS তথ্য" tone="info">
          <div className="field-grid">
            <label>DOTS Corner<input value={form.dotsCenter || ""} onChange={(e) => u("dotsCenter", e.target.value)} /></label>
            <label>SS নাম<input value={form.ssName || ""} onChange={(e) => u("ssName", e.target.value)} /></label>
            <label>SS মোবাইল<input value={form.ssPhone || ""} onChange={(e) => u("ssPhone", e.target.value)} /></label>
            <label>DOT Provider নাম<input value={form.dotProviderName || ""} onChange={(e) => u("dotProviderName", e.target.value)} /></label>
            <label>DOT Provider Type<select value={form.dotProviderType || ""} onChange={(e) => u("dotProviderType", e.target.value)}><option value="">Select</option><option>SS</option><option>Community</option><option>Health Worker</option><option>Family</option></select></label>
            <label>Contact Investigator<input value={form.contactInvestigatorName || ""} onChange={(e) => u("contactInvestigatorName", e.target.value)} /></label>
            <label>Referrer name<input value={form.referrer || ""} onChange={(e) => u("referrer", e.target.value)} /></label>
            <label>রেফার উৎস<select value={form.referralSource || ""} onChange={(e) => u("referralSource", e.target.value)}><option value="">Select</option><option>Active screening</option><option>OPD / Facility</option><option>Private referral</option><option>Contact investigation</option><option>Self-referral</option></select></label>
          </div>
        </SectionCard>

        {/* গ — Diagnosis & Lab */}
        <SectionCard title="গ — রোগ নির্ণয় ও পরীক্ষার ফলাফল" tone="purple">
          <div className="diagnosis-panel">
            <div className="diagnosis-choice-grid">
              <div className="diagnosis-choice-block">
                <p className="form-subtitle">রোগের ধরন (TB Type)</p>
            <RadioChips options={[{ value: "Pulmonary", label: "Pulmonary (ফুসফুসীয়)" }, { value: "Extra-pulmonary", label: "Extra-pulmonary" }]} value={form.tbType || ""} onChange={(v) => u("tbType", v)} />
            {isExtraPulmonary && (
              <>
                <label className="diagnosis-ep-site">EP Site<input value={form.epSite || ""} onChange={(e) => u("epSite", e.target.value)} placeholder="e.g. Lymph Node, Pleural" /></label>
                <p className="code-hint">EP patient: sputum follow-up is not required. Extend the treatment end date when the clinician advises treatment beyond 180 programme days.</p>
              </>
            )}
              </div>
              <div className="diagnosis-choice-block">
                <p className="form-subtitle">নিশ্চিতকরণ পদ্ধতি</p>
            <RadioChips options={[{ value: "BC", label: "BC (ব্যাক্টেরিওলজিক্যালি)" }, { value: "CD", label: "CD (ক্লিনিক্যালি)" }]} value={form.confirmationMethod || ""} onChange={(v) => u("confirmationMethod", v)} />
              </div>
            </div>
            <div className="diagnosis-screening-panel">
              <p className="form-subtitle">Clinical screening</p>
              <div className="field-grid diagnosis-screening-grid">
              <label>BCG Scar<select value={clinical.bcgScar || ""} onChange={(e) => updateClinical("bcgScar", e.target.value)}><option value="">Select</option><option>Present</option><option>Absent</option><option>Unknown</option></select></label>
              <label>HIV test<select value={clinical.hivStatus || ""} onChange={(e) => updateClinical("hivStatus", e.target.value)}><option value="">Select</option><option>Positive</option><option>Negative</option><option>Not Done</option></select></label>
              <label>CPT start date<DateInput value={clinical.cptStartDate || ""} onChange={(v) => updateClinical("cptStartDate", v)} /></label>
              <label>ART start date<DateInput value={clinical.artStartDate || ""} onChange={(v) => updateClinical("artStartDate", v)} /></label>
              <label>COVID-19<select value={clinical.covidStatus || ""} onChange={(e) => updateClinical("covidStatus", e.target.value)}><option value="">Select</option><option>Positive</option><option>Negative</option><option>Not Done</option></select></label>
              <label>Malaria<select value={clinical.malariaStatus || ""} onChange={(e) => updateClinical("malariaStatus", e.target.value)}><option value="">Select</option><option>Positive</option><option>Negative</option><option>Not Done</option></select></label>
              </div>
            </div>
            {existing && (
              <div className="diagnosis-lab-panel">
                <div className="diagnosis-lab-tabs" role="list" aria-label="Lab result type">
                  {labTypeCards.map((card) => (
                    <button
                      key={card.value}
                      type="button"
                      className={`diagnosis-lab-card ${card === activeLabCard ? "active" : ""}`}
                      onClick={() => setLabForm((c) => ({ ...c, testType: card.value }))}
                    >
                      <span className="diagnosis-lab-icon">{card.icon}</span>
                      <strong>{card.title}</strong>
                      <small>{card.helper}</small>
                    </button>
                  ))}
                </div>
                <div className="diagnosis-lab-entry">
                  <div className="diagnosis-lab-entry-head">
                    <div>
                      <p className="form-subtitle">Lab result entry</p>
                      <h4>{activeLabCard.title}</h4>
                    </div>
                    <StatusBadge tone={labForm.result ? "success" : "info"}>{labForm.result || "Not recorded"}</StatusBadge>
                  </div>
                  <div className="field-grid lab-fields">
              <label>Test Type<select value={labForm.testType} onChange={(e) => setLabForm((c) => ({ ...c, testType: e.target.value }))}><option>GeneXpert</option><option>Truenat</option><option>Microscopy</option><option>X-ray</option><option>Culture</option></select></label>
              <label>Lab ID<input value={labForm.labId} onChange={(e) => setLabForm((c) => ({ ...c, labId: e.target.value }))} /></label>
              <label>Test Date<DateInput value={labForm.testDate} onChange={(v) => setLabForm((c) => ({ ...c, testDate: v }))} /></label>
              <label>Result<input value={labForm.result} onChange={(e) => setLabForm((c) => ({ ...c, result: e.target.value }))} placeholder="MTB Detected / RR / Not Detected" /></label>
              <label>Quantity<input value={labForm.quantity} onChange={(e) => setLabForm((c) => ({ ...c, quantity: e.target.value }))} placeholder="Low / Medium / High" /></label>
              <label>Scanty count<input value={labForm.scantyCount} onChange={(e) => setLabForm((c) => ({ ...c, scantyCount: e.target.value }))} placeholder="AFB count" /></label>
              <label className="wide">Lab notes<textarea value={labForm.notes} onChange={(e) => setLabForm((c) => ({ ...c, notes: e.target.value }))} placeholder="X-ray finding, repeat advice, or lab notes" /></label>
              <label className="wide" style={{ gap: 0 }}><span>&nbsp;</span><button className="primary-action" type="button" aria-label="Add lab result" onClick={() => {
                if (!labForm.result) return;
                onSaveLab({ id: "", patientId: existing.id, testType: labForm.testType as LabResult["testType"], labId: labForm.labId, testDate: labForm.testDate, result: labForm.result, quantity: labForm.quantity, scantyCount: labForm.scantyCount, notes: labForm.notes, createdAt: now(), updatedAt: now() });
                setLabForm({ testType: "GeneXpert", labId: "", testDate: toLocalIsoDate(), result: "", quantity: "", scantyCount: "", notes: "" });
              }}>+ Lab Result</button></label>
                  </div>
                </div>
              </div>
            )}
            <div className="mini-list">
            {pLabs.map((l) => (
              <StatusBadge key={l.id} tone={l.result?.includes("RR") ? "danger" : l.result?.toLowerCase().includes("detected") ? "warning" : "info"}>
                {l.testType}: {l.result} {l.testDate ? `(${formatDateDisplay(l.testDate)})` : ""}
              </StatusBadge>
            ))}
            </div>
            <div className="diagnosis-alert-slot"></div>
          </div>
          {pLabs.some((l) => l.result?.includes("RR")) && <AlertCard level="critical" message="⚠ RR (Rif Resistant) ফলাফল! DR-TB referral প্রয়োজন।" />}
        </SectionCard>

        {/* ঘ — Treatment History */}
        <SectionCard title="ঘ — চিকিৎসার ইতিহাস ও পর্যায়" tone="warning">
          <div style={{ marginBottom: 14 }}>
            <label style={{ marginBottom: 8, display: "block" }}>Patient Type</label>
            <RadioChips options={[{ value: "New", label: "New" }, { value: "Relapse", label: "Relapse" }, { value: "After Failure", label: "After Failure" }, { value: "LTFU", label: "LTFU" }, { value: "Transfer In", label: "Transfer In" }, { value: "Others", label: "Others" }]} value={form.patientType || ""} onChange={(v) => u("patientType", v)} />
          </div>
          <div className="field-grid">
            <label>চিকিৎসা শুরুর তারিখ<DateInput value={form.treatmentStartDate || ""} onChange={(v) => u("treatmentStartDate", v)} /></label>
            <label>Phase<select value={form.phase || ""} onChange={(e) => u("phase", e.target.value)}><option>Pre-treatment</option><option>Intensive Phase</option><option>Continuation Phase</option><option>Completed</option></select></label>
            <label>Next Follow-up<DateInput value={form.nextFollowUpDate || ""} onChange={(v) => u("nextFollowUpDate", v)} /></label>
            <label>Previous TR No<input value={form.previousTr || ""} onChange={(e) => u("previousTr", e.target.value)} /></label>
            <label>Treatment end / doctor course date<DateInput value={treatmentSchedule.treatmentEndDate || ""} onChange={updateTreatmentEndDate} /></label>
            {form.patientType === "Transfer In" && <label>Transfer From<input value={form.transferFrom || ""} onChange={(e) => u("transferFrom", e.target.value)} /></label>}
            <label>Drug reaction / side effect<input value={form.drugReaction || ""} onChange={(e) => u("drugReaction", e.target.value)} /></label>
            <label className="wide">Treatment history note<textarea value={clinical.treatmentHistoryNote || ""} onChange={(e) => updateClinical("treatmentHistoryNote", e.target.value)} placeholder="Previous treatment, private provider, special history..." /></label>
            <label className="wide">Clinical note<textarea value={form.clinicalNote || ""} onChange={(e) => u("clinicalNote", e.target.value)} placeholder="Current clinical notes, counselling, or special follow-up instructions..." /></label>
          </div>
          {hasScheduleStart && (
            <div className="dot-stats" style={{ marginTop: 14 }}>
              {treatmentSchedule.ipEndDate && <span>IP End: {formatDateDisplay(treatmentSchedule.ipEndDate)}</span>}
              {treatmentSchedule.treatmentEndDate && <span>Treatment End: {formatDateDisplay(treatmentSchedule.treatmentEndDate)}</span>}
              {activeSputumStages.map((stage) => <span key={stage}>Sputum {stage}: {formatDateDisplay(sputumDueDates?.[stage])}</span>)}
            </div>
          )}
          {!form.drugStartDate && <AlertCard level="medium" message="Drug start date is required before IP end, treatment end, sputum follow-up, and DOT dates can be calculated." />}
          {hasScheduleStart && <p className="code-hint">Drug start date drives IP end, treatment end, sputum follow-up, and DOT medicine tracking. All programme dates use fixed day-count math: 1 month = 30 days, and the drug start date is day 1.</p>}
          {form.tbType === "Pulmonary" && form.confirmationMethod === "BC" && <p className="code-hint">Pulmonary BC follow-up: 2M, 5M, and 6M sputum checks are required.</p>}
          {form.tbType === "Pulmonary" && form.confirmationMethod === "CD" && <p className="code-hint">Pulmonary CD follow-up: only the 2M sputum check is required.</p>}
          {isExtraPulmonary && hasScheduleStart && <p className="code-hint">EP patient plan: no sputum follow-up schedule. Treatment can continue after 180 programme days by changing the treatment end / extension date.</p>}
        </SectionCard>

        {/* ঙ — Drug Regimen */}
        <SectionCard title="ঙ — ওষুধের ব্যবস্থাপত্র (Drug Regimen)" tone="info" defaultOpen={false}>
          <div className="field-grid">
            <label>Regimen Type<select value={form.regimenType || ""} onChange={(e) => u("regimenType", e.target.value)}><option value="">Select Regimen</option>{regimenOptions.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label>রোগীর ওজন (kg)<input type="number" value={form.weightKg || ""} onChange={(e) => u("weightKg", Number(e.target.value))} /></label>
            <label>Drug start date<DateInput value={form.drugStartDate || ""} onChange={updateDrugStartDate} /></label>
            <label>Treatment length<select value={treatmentLengthMonths} onChange={(e) => updateTreatmentLengthMonths(Number(e.target.value))}>{TREATMENT_LENGTH_MONTH_OPTIONS.map((months) => <option key={months} value={months}>{months} months ({months * 30} days)</option>)}</select></label>
            <label>{isExtraPulmonary ? "EP treatment extended until" : "Treatment end date"}<DateInput value={treatmentSchedule.treatmentEndDate || ""} onChange={(v) => u("treatmentEndDate", v)} /></label>
          </div>
          <p className="code-hint">DOT starts from Drug start date ({formatDateDisplay(dotPlanStartDate) || "not set"}) and continues until Treatment end date ({formatDateDisplay(dotPlanEndDate) || "not set"}). Treatment length is {treatmentLengthMonths} months ({treatmentLengthDays} programme days), using 1 month = 30 days and the drug start date as day 1. {!form.drugStartDate ? "Enter drug start date to calculate the official programme schedule." : ""} {isExtraPulmonary ? `EP continuation medicine (${dosePlan?.lines.find((line) => /continuation/i.test(line.phase))?.drug || "2FDC"}) remains active until that end date.` : "Pulmonary sputum follow-up uses the same drug-start programme-day schedule."}</p>
          {drugs && dosePlan && (
            <div className="drug-dose-panel">
              <div className="drug-dose-header">
                <div>
                  <p className="form-subtitle">Auto dose helper</p>
                  <h4>{dosePlan.regimenName}</h4>
                </div>
                <StatusBadge tone={dosePlan.weightBand ? "success" : "warning"}>{dosePlan.weightBand || "Weight needed"}</StatusBadge>
              </div>
              <div className="dose-summary-grid">
                <div>
                  <span>Daily tablets</span>
                  <strong>{dosePlan.lines.find((line) => line.selected)?.tabletsPerDay ? `${dosePlan.lines.find((line) => line.selected)?.tabletsPerDay} tabs/day` : dosePlan.summary}</strong>
                </div>
                <div>
                  <span>Active phase</span>
                  <strong>{dosePlan.lines.find((line) => line.selected)?.phase || form.phase || "Select phase"}</strong>
                </div>
                <div>
                  <span>Patient weight</span>
                  <strong>{form.weightKg ? `${form.weightKg} kg` : "Not entered"}</strong>
                </div>
              </div>
              <div className="drug-dose-list">
                {dosePlan.lines.map((line) => (
                  <article className={`drug-dose-card ${line.selected ? "active" : ""}`} key={`${line.phase}-${line.drug}`}>
                    <div className="drug-dose-check" aria-hidden="true">{line.selected ? "✓" : ""}</div>
                    <div className="drug-dose-main">
                      <strong>{line.drug}</strong>
                      <span>{line.phase}{line.duration ? ` · ${line.duration}` : ""}</span>
                    </div>
                    <div className="drug-dose-result">
                      <small>Calculated daily dose</small>
                      <strong>{line.doseText}</strong>
                    </div>
                  </article>
                ))}
              </div>
              <p className="drug-dose-caution">⚠ {dosePlan.caution}</p>
            </div>
          )}
          {false && drugs && (
            <div className="drug-list" style={{ marginTop: 14 }}>
              <p style={{ fontWeight: 700, color: "var(--g)" }}>{drugs?.name}</p>
              {drugs?.drugs.map((d) => <div className="drug-item" key={d}><input type="checkbox" defaultChecked /><span>{d}</span></div>)}
              <p style={{ fontSize: 13, color: "var(--red)", marginTop: 8 }}>⚠ Dose ও সময়সূচী NTP guideline অনুযায়ী নির্ধারিত হবে। FO নিজে dose পরিবর্তন করবে না।</p>
            </div>
          )}
        </SectionCard>

        {existing && (
          <>
            {/* চ — DOT Grid */}
            <SectionCard title="চ — DOT Daily Tracking Grid" tone="info">
              {!form.drugStartDate && <AlertCard level="medium" message="Drug start date missing. DOT tracking starts only after drug start date is entered." />}
              <DotGrid patientId={existing.id} entries={dotEntries} monthKey={dotMonth} treatmentStartDate={dotPlanStartDate} treatmentEndDate={dotPlanEndDate} startSource={dotPlan.source} dosePlan={dosePlan} onMonthChange={setDotMonth}
                onToggle={(day, status) => {
                  const existingEntry = dotEntries.find((e) => e.patientId === existing.id && e.monthKey === dotMonth && e.day === day);
                  onSaveDot({ id: existingEntry?.id || "", patientId: existing.id, date: `${dotMonth}-${String(day).padStart(2, "0")}`, monthKey: dotMonth, day, status, updatedAt: now() });
                }} />
            </SectionCard>

            {/* ছ — Sputum Follow-up */}
            {!isExtraPulmonary && (
            <SectionCard title="ছ — Sputum Follow-up" tone="purple" defaultOpen={false}>
              {activeSputumStages.length ? (
                <div className="sputum-cards">
                  {activeSputumStages.map((stage) => {
                    const dueDate = sputumDueDates?.[stage] || "";
                    const record = pSputum.find((s) => s.stage === stage);
                    const draft = sputumDraftFor(stage, dueDate);
                    const isOverdue = new Date(dueDate) < new Date() && !record;
                    const isDue = !isOverdue && Math.abs(new Date(dueDate).getTime() - Date.now()) < 7 * 86400000 && !record;
                    return (
                      <div className={`sputum-stage ${isOverdue ? "overdue" : isDue ? "due" : ""}`} key={stage}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>{stage} Sputum Follow-up</strong>
                          <StatusBadge tone={isOverdue ? "danger" : isDue ? "warning" : record ? "success" : "neutral"}>{isOverdue ? "Overdue" : isDue ? "Due" : record ? "Done" : `Due ${formatDateDisplay(dueDate)}`}</StatusBadge>
                        </div>
                        {record && <p style={{ color: "var(--muted)" }}>Microscopy: {record.microscopyResult || "—"} · GeneXpert: {record.geneXpertResult || "—"}</p>}
                        <div className="field-grid" style={{ marginTop: 10 }}>
                          <label>{stage} test date<DateInput value={draft.testDate || ""} onChange={(v) => updateSputumDraft(stage, { testDate: v })} /></label>
                          <label>{stage} Lab ID<input value={draft.labId || ""} onChange={(e) => updateSputumDraft(stage, { labId: e.target.value })} /></label>
                          <label>{stage} Microscopy<input value={draft.microscopyResult || ""} onChange={(e) => updateSputumDraft(stage, { microscopyResult: e.target.value, microscopy: e.target.value })} placeholder="Negative / 1+ / Scanty" /></label>
                          <label>{stage} GeneXpert/Truenat<input value={draft.geneXpertResult || ""} onChange={(e) => updateSputumDraft(stage, { geneXpertResult: e.target.value, xpertTruenat: e.target.value })} placeholder="N / T / RR" /></label>
                          <label>{stage} Culture<input value={draft.culture || ""} onChange={(e) => updateSputumDraft(stage, { culture: e.target.value })} /></label>
                          <label>{stage} Weight<input type="number" value={draft.weightKg || ""} onChange={(e) => updateSputumDraft(stage, { weightKg: e.target.value ? Number(e.target.value) : undefined })} /></label>
                          <label className="wide">{stage} Comment<textarea value={draft.comment || ""} onChange={(e) => updateSputumDraft(stage, { comment: e.target.value })} /></label>
                          <label className="wide" style={{ gap: 0 }}><span>&nbsp;</span><button className="ghost-button" type="button" aria-label={`Save ${stage} result`} onClick={() => onSaveSputum({ id: draft.id || "", patientId: existing.id, stage, dueDate, testDate: draft.testDate, labId: draft.labId, microscopy: draft.microscopy || draft.microscopyResult, microscopyResult: draft.microscopyResult || draft.microscopy, geneXpertResult: draft.geneXpertResult || draft.xpertTruenat, xpertTruenat: draft.xpertTruenat || draft.geneXpertResult, culture: draft.culture, weightKg: draft.weightKg, comment: draft.comment, createdAt: draft.createdAt || now(), updatedAt: now() })}>
                            <Plus size={14} /> Save {stage} result
                          </button></label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p style={{ color: "var(--muted)" }}>Drug start date দিন sputum schedule দেখতে।</p>}
            </SectionCard>
            )}

            {/* জ — Contact Investigation */}
            <SectionCard title="জ — সংস্পর্শ তদন্ত (Contact Investigation)" tone="purple">
              <div className="field-grid" style={{ marginBottom: 14 }}>
                <label>CI date<DateInput value={ciDate} onChange={setCiDate} /></label>
                <label>CI investigator phone<input value={ciPhone} onChange={(e) => setCiPhone(e.target.value)} /></label>
                <label>Contact নাম<input value={ciName} onChange={(e) => setCiName(e.target.value)} /></label>
                <label>বয়স<input type="number" value={ciAge} onChange={(e) => setCiAge(e.target.value)} /></label>
                <label>লিঙ্গ<select value={ciSex} onChange={(e) => setCiSex(e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option></select></label>
                <label>সম্পর্ক<select value={ciRel} onChange={(e) => setCiRel(e.target.value)}><option value="">Select</option><option value="1">1-স্বামী/স্ত্রী</option><option value="2">2-পিতা/মাতা</option><option value="3">3-সন্তান</option><option value="4">4-ভাই/বোন</option><option value="5">5-অন্যান্য</option></select></label>
                <label>লক্ষণ<select value={ciSym} onChange={(e) => setCiSym(e.target.value)}><option value="">Select</option><option value="1">1-কাশি ≥2 সপ্তাহ</option><option value="2">2-জ্বর</option><option value="3">3-ওজন হ্রাস</option><option value="4">4-রাতে ঘাম</option><option value="5">5-লক্ষণ নেই</option></select></label>
                <label>Referred?<select value={ciReferred} onChange={(e) => setCiReferred(e.target.value)}><option value="">Select</option><option>Yes</option><option>No</option></select></label>
                <label>Investigation code<input value={ciInvestigation} onChange={(e) => setCiInvestigation(e.target.value)} placeholder="1-5" /></label>
                <label>CI result<input value={ciResult} onChange={(e) => setCiResult(e.target.value)} placeholder="T / RR / N / Neg" /></label>
                <label>Outcome code<input value={ciOutcome} onChange={(e) => setCiOutcome(e.target.value)} placeholder="1-6" /></label>
                <label>TR/TPT No<input value={ciTrOrTpt} onChange={(e) => setCiTrOrTpt(e.target.value)} /></label>
                <label>CI follow-up date<DateInput value={ciFollowUp} onChange={setCiFollowUp} /></label>
                <label className="wide" style={{ gap: 0 }}><span>&nbsp;</span><button className="primary-action" type="button" aria-label="Add contact" onClick={() => {
                  if (!ciName) return;
                  onSaveContact({ id: "", patientId: existing.id, ciDate, investigatorName: form.contactInvestigatorName, investigatorPhone: ciPhone, name: ciName, age: ciAge ? Number(ciAge) : undefined, sex: ciSex as ContactPerson["sex"], relationshipCode: ciRel, symptomCode: ciSym, referred: ciReferred as ContactPerson["referred"], investigationCode: ciInvestigation, result: ciResult, outcomeCode: ciOutcome, trOrTptNo: ciTrOrTpt, followUpDate: ciFollowUp, createdAt: now(), updatedAt: now() });
                  setCiName(""); setCiAge(""); setCiSex(""); setCiRel(""); setCiSym(""); setCiDate(""); setCiPhone(""); setCiReferred(""); setCiInvestigation(""); setCiResult(""); setCiOutcome(""); setCiTrOrTpt(""); setCiFollowUp("");
                }}><Plus size={14} /> Contact যোগ</button></label>
              </div>
              <div className="contact-cards">
                {pContacts.map((c) => (
                  <div className={`contact-card ${c.isChild ? "child" : ""} ${c.isSymptomatic ? "symptomatic" : ""}`} key={c.id}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{c.name}</strong>
                      <div className="badge-row">
                        {c.isChild && <StatusBadge tone="danger">শিশু (&lt;5)</StatusBadge>}
                        {c.isSymptomatic && <StatusBadge tone="warning">লক্ষণযুক্ত</StatusBadge>}
                        {c.tptEligible && <StatusBadge tone="info">TPT Eligible</StatusBadge>}
                      </div>
                    </div>
                    <p style={{ color: "var(--muted)", margin: "4px 0" }}>বয়স: {c.age || "—"} · {c.sex || "—"} · সম্পর্ক: {c.relationshipCode || "—"} · লক্ষণ: {c.symptomCode || "—"}</p>
                  </div>
                ))}
              </div>
              {pContacts.length === 0 && <p style={{ color: "var(--muted)" }}>কোনো contact নেই। উপরের ফর্ম দিয়ে যোগ করুন।</p>}
              <div className="code-hint">
                <strong>কোড:</strong> সম্পর্ক — 1:স্বামী/স্ত্রী 2:পিতা/মাতা 3:সন্তান 4:ভাই/বোন 5:অন্যান্য | লক্ষণ — 1:কাশি 2:জ্বর 3:ওজন হ্রাস 4:রাতে ঘাম 5:নেই
              </div>
            </SectionCard>

            {/* TPT */}
            <SectionCard title="TPT (TB Preventive Therapy)" tone="info" defaultOpen={false}>
              <div className="action-row" style={{ marginBottom: 14 }}>
                <button type="button" className="ghost-button" aria-label="Start TPT" onClick={startTpt}><Plus size={14} /> TPT শুরু</button>
              </div>
              <div className="mini-list">{pTpt.map((t) => {
                const expectedEndDate = t.startDate ? calculateTptEndDate(t.startDate, t.regimen || "") : t.expectedEndDate;
                return <StatusBadge key={t.id} tone={t.status === "Active" ? "success" : t.status === "Completed" ? "info" : "warning"}>{t.name}: {t.status} ({t.regimen || "—"}){expectedEndDate ? ` · End ${formatDateDisplay(expectedEndDate)}` : ""}</StatusBadge>;
              })}</div>
            </SectionCard>

            <SectionCard title="Attachments" tone="info">
              <div className={`location-card ${houseLocation ? "saved" : ""}`}>
                <div className="location-head">
                  <div className="location-icon"><MapPin size={20} /></div>
                  <div>
                    <h4>Location tracking</h4>
                    <p>{houseLocation ? "Patient house location saved." : "No location saved. FO can capture GPS at the patient house."}</p>
                  </div>
                </div>
                {houseLocation ? (
                  <div className="location-summary">
                    <strong>{formatHouseCoordinates(houseLocation)}</strong>
                    <span>{formatLocationAccuracy(houseLocation.accuracyMeters) || "Accuracy not recorded"} · {houseLocation.source === "gps" ? "GPS" : "Manual"} · {formatDateTimeDisplay(houseLocation.capturedAt) || "time not recorded"}</span>
                  </div>
                ) : null}
                <div className="location-actions">
                  <button className="ghost-button compact" type="button" onClick={handleUseCurrentGps} disabled={locationBusy}>
                    <LocateFixed size={14} /> {locationBusy ? "Reading GPS..." : "Use current GPS"}
                  </button>
                  {houseLocation ? (
                    <>
                      <button className="ghost-button compact" type="button" onClick={() => window.open(buildGoogleMapsPointUrl(houseLocation), "_blank", "noopener,noreferrer")}>
                        <ExternalLink size={14} /> Open Google Maps
                      </button>
                      <button className="ghost-button compact" type="button" onClick={() => window.open(buildGoogleMapsDirectionsUrl(houseLocation), "_blank", "noopener,noreferrer")}>
                        <Navigation size={14} /> Directions
                      </button>
                      <button className="ghost-button compact" type="button" onClick={() => void copyLocationLink()}>
                        <Copy size={14} /> Copy link
                      </button>
                      <button className="ghost-button compact danger-text" type="button" onClick={() => commitHouseLocation()}>
                        <Trash2 size={14} /> Clear
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="location-manual-grid">
                  <label>Latitude<input inputMode="decimal" value={manualLatitude} onChange={(e) => setManualLatitude(e.target.value)} placeholder="23.810331" /></label>
                  <label>Longitude<input inputMode="decimal" value={manualLongitude} onChange={(e) => setManualLongitude(e.target.value)} placeholder="90.412521" /></label>
                  <button className="ghost-button compact" type="button" onClick={handleManualLocationSave}>Save manual point</button>
                </div>
                {locationMessage ? <p className="location-message">{locationMessage}</p> : null}
              </div>
              <div className="attachment-toolbar">
                <label className={`file-upload-control ${attachmentBusy ? "busy" : ""}`}>
                  <Upload size={16} />
                  <span>{attachmentBusy ? "Uploading..." : "Upload file"}</span>
                  <input
                    type="file"
                    disabled={attachmentBusy || !onUploadAttachment}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      void handleAttachmentUpload(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <span className="attachment-count">{pAttachments.length} file{pAttachments.length === 1 ? "" : "s"}</span>
              </div>
              {attachmentMessage && <p className="attachment-message">{attachmentMessage}</p>}
              <div className="attachment-list">
                {pAttachments.map((attachment) => (
                  <article className="attachment-item" key={attachment.id}>
                    <div className="attachment-icon"><FileText size={18} /></div>
                    <div className="attachment-copy">
                      <strong>{attachment.fileName}</strong>
                      <span>{attachment.fileType || "File"} - {formatFileSize(attachment.fileSize)} - {formatDateTimeDisplay(attachment.createdAt)}</span>
                    </div>
                    <button className="ghost-button compact" type="button" onClick={() => void onOpenAttachment?.(attachment)}>
                      <ExternalLink size={14} /> Open
                    </button>
                  </article>
                ))}
              </div>
              {pAttachments.length === 0 && <p className="empty-copy">No files attached yet.</p>}
            </SectionCard>

            {/* ঝ — Outcome */}
            <SectionCard title="ঝ — চিকিৎসার ফলাফল (Outcome)" tone="success">
              <div className="outcome-grid">
                {[
                  { value: "Cured", label: "নিরাময় (Cured)", icon: "✅" },
                  { value: "Treatment Completed", label: "চিকিৎসা সম্পন্ন", icon: "🏁" },
                  { value: "Died", label: "মৃত্যু (Died)", icon: "🕊" },
                  { value: "Lost to Follow-up", label: "Follow-up হারানো", icon: "🔍" },
                  { value: "Treatment Failure", label: "চিকিৎসা ব্যর্থ", icon: "⚠" },
                  { value: "Not Evaluated", label: "মূল্যায়ন হয়নি", icon: "❓" },
                  { value: "Transfer Out", label: "স্থানান্তর", icon: "🔄" },
                ].map((o) => (
                  <button className={`outcome-card ${form.outcome === o.value ? "selected" : ""}`} key={o.value} type="button" onClick={() => u("outcome", form.outcome === o.value ? "" : o.value)}>
                    <span className="oc-icon">{o.icon}</span><strong>{o.label}</strong><small>{o.value}</small>
                  </button>
                ))}
              </div>
              {form.outcome && (
                <div className="field-grid" style={{ marginTop: 14 }}>
                  <label>Outcome Date<DateInput value={form.outcomeDate || ""} onChange={(v) => u("outcomeDate", v)} /></label>
                  <label>Sign officer<input value={form.signOfficer || ""} onChange={(e) => u("signOfficer", e.target.value)} /></label>
                  {form.outcome === "Transfer Out" && <label>Transfer To<input value={form.transferTo || ""} onChange={(e) => u("transferTo", e.target.value)} placeholder="গন্তব্য কেন্দ্র/জেলা" /></label>}
                  <label className="wide">মন্তব্য<textarea value={form.outcomeNote || ""} onChange={(e) => u("outcomeNote", e.target.value)} placeholder="Outcome সম্পর্কিত নোট..." /></label>
                </div>
              )}
            </SectionCard>

            <div className="danger-zone"><button type="button" onClick={() => onDelete(existing.id)}><Trash2 size={16} /> রেকর্ড Delete</button></div>
          </>
        )}
      </div>
    </>
  );
}
