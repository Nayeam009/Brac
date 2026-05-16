export type UserRole = "fo";
export type ProfileStatus = "pending" | "active" | "blocked";
export type TreatmentPhase =
  | "Pre-treatment"
  | "Intensive Phase"
  | "Continuation Phase"
  | "Completed"
  | "Defaulted / LFU"
  | "Died"
  | "Transfer Out"
  | "Treatment Failure"
  | "";
export type TreatmentOutcome =
  | "Cured"
  | "Treatment Completed"
  | "Died"
  | "Treatment Failure"
  | "Lost to Follow-up"
  | "Transfer Out"
  | "Not Evaluated"
  | "";

export type Profile = {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  role: UserRole;
  status: ProfileStatus;
  district?: string;
  upazila?: string;
  createdAt: string;
  updatedAt: string;
};

export type Patient = {
  id: string;
  tr?: string;
  dotsNo?: string;
  etbId?: string;
  registrationDate?: string;
  name: string;
  age?: number;
  sex?: "Male" | "Female" | "Other" | "";
  weight?: number;
  phone?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
  ward?: string;
  union?: string;
  upazila?: string;
  district?: string;
  dotsCenter?: string;
  ssName?: string;
  ssPhone?: string;
  dotProviderName?: string;
  dotProviderType?: string;
  contactInvestigatorName?: string;
  referrer?: string;
  referralSource?: string;
  tbType?: "Pulmonary" | "Extra-pulmonary" | "";
  epSite?: string;
  confirmationMethod?: "BC" | "CD" | "";
  patientType?: string;
  phase?: TreatmentPhase;
  previousTr?: string;
  transferFrom?: string;
  treatmentStartDate?: string;
  ipEndDate?: string;
  treatmentEndDate?: string;
  nextFollowUpDate?: string;
  regimenType?: string;
  weightKg?: number;
  drugStartDate?: string;
  outcome?: TreatmentOutcome;
  outcomeDate?: string;
  transferTo?: string;
  signOfficer?: string;
  outcomeNote?: string;
  drugReaction?: string;
  clinicalNote?: string;
  ownerId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RecordAttachment = {
  id: string;
  recordType: "patient";
  recordId: string;
  fileName: string;
  fileType?: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
};

export type LabResult = {
  id: string;
  patientId: string;
  testType: "GeneXpert" | "Truenat" | "Microscopy" | "Xray" | "Culture" | "Other";
  labId?: string;
  testDate?: string;
  result?: string;
  quantity?: string;
  scantyCount?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type DotEntry = {
  id: string;
  patientId: string;
  date: string;
  monthKey: string;
  day: number;
  status: "done" | "missed" | "supervised" | "";
  updatedBy?: string;
  updatedAt: string;
};

export type SputumFollowUp = {
  id: string;
  patientId: string;
  stage: "2M" | "5M" | "6M" | "Other";
  dueDate?: string;
  testDate?: string;
  labId?: string;
  microscopy?: string;
  microscopyResult?: string;
  geneXpertResult?: string;
  xpertTruenat?: string;
  culture?: string;
  weightKg?: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactPerson = {
  id: string;
  patientId: string;
  ciDate?: string;
  investigatorName?: string;
  investigatorPhone?: string;
  name: string;
  age?: number;
  sex?: "M" | "F" | "O" | "Male" | "Female" | "Other" | "";
  relationshipCode?: string;
  symptomCode?: string;
  referred?: "Yes" | "No" | "";
  investigationCode?: string;
  result?: string;
  outcomeCode?: string;
  trOrTptNo?: string;
  followUpDate?: string;
  isChild?: boolean;
  isSymptomatic?: boolean;
  tptEligible?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TptRecord = {
  id: string;
  patientId?: string;
  contactId?: string;
  name: string;
  age?: number;
  sex?: string;
  regimen?: "3HR" | "3HP" | "6H" | "Other";
  startDate?: string;
  expectedEndDate?: string;
  actualEndDate?: string;
  status: "Not Started" | "Active" | "Completed" | "Defaulted" | "Stopped" | "";
  nextFollowUpDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaryType =
  | "New Patient"
  | "Record Updated"
  | "DOT Updated"
  | "Lab Updated"
  | "Sputum Updated"
  | "CI Updated"
  | "TPT Updated"
  | "Outcome Updated"
  | "Download"
  | "Delete"
  | "Report Generated"
  | "Task Completed"
  | "General";

export type DiaryEntry = {
  id: string;
  time: string;
  date: string;
  type: DiaryType;
  patientId?: string;
  tr?: string;
  patientName?: string;
  details: string;
  userId?: string;
  userName?: string;
  metadata?: Record<string, unknown>;
};

export type TaskType =
  | "DOT_MISSED"
  | "DOT_NOT_UPDATED"
  | "FOLLOWUP_DUE"
  | "FOLLOWUP_OVERDUE"
  | "LAB_PENDING"
  | "TREATMENT_START_PENDING"
  | "DR_TB_REFERRAL"
  | "CI_PENDING"
  | "TPT_DUE"
  | "OUTCOME_PENDING"
  | "REPORT_DUE";

export type Task = {
  id: string;
  patientId?: string;
  type: TaskType;
  title: string;
  description?: string;
  dueDate?: string;
  priority: "Critical" | "High" | "Medium" | "Normal";
  status: "Open" | "Done" | "Dismissed";
  createdAt: string;
  completedAt?: string;
};

export type Provider = {
  id: string;
  name: string;
  type:
    | "SS"
    | "DOT Provider"
    | "Community"
    | "Health Worker"
    | "Family"
    | "Pharmacist"
    | "Village Doctor"
    | "Clinic"
    | "CHCP"
    | "Health Facility"
    | "Other";
  phone?: string;
  area?: string;
  union?: string;
  ward?: string;
  lastVisitDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
