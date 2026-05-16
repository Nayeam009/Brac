import { describe, expect, it } from "vitest";
import {
  buildDiaryEntry,
  calculateDrugDosePlan,
  calculateTreatmentEndDateFromMonths,
  calculateTreatmentDates,
  calculateTptEndDate,
  dateForTreatmentDay,
  detectDataQualityIssues,
  detectDuplicatePatient,
  generateWorklist,
  resolvePatientDotPlan,
  resolvePatientEntryMode,
  resolvePatientTreatmentSchedule,
  shouldCreateLiveDiaryEntry,
  withResolvedPatientEntryMetadata,
} from "./automation";
import type { DotEntry, LabResult, Patient, SputumFollowUp } from "./types";

const basePatient: Patient = {
  id: "pat_1",
  tr: "131/26",
  name: "রহিম উদ্দিন",
  phone: "01711111111",
  tbType: "Pulmonary",
  confirmationMethod: "BC",
  phase: "Continuation Phase",
  treatmentStartDate: "2026-01-01",
  treatmentEndDate: "2026-07-01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TB workflow automation", () => {
  it("calculates IP end, treatment end, and sputum due dates from treatment start", () => {
    expect(dateForTreatmentDay("2026-05-01", 60)).toBe("2026-06-29");
    expect(calculateTreatmentDates("2026-05-01")).toEqual({
      ipEndDate: "2026-06-29",
      treatmentEndDate: "2026-10-27",
      sputumDueDates: {
        "2M": "2026-06-29",
        "5M": "2026-09-27",
        "6M": "2026-10-27",
      },
    });
  });

  it("calculates doctor course end from selected 30-day treatment length", () => {
    expect(calculateTreatmentEndDateFromMonths("2025-12-11", 6)).toBe("2026-06-08");
    expect(calculateTreatmentEndDateFromMonths("2025-12-11", 9)).toBe("2026-09-06");
    expect(calculateTreatmentEndDateFromMonths("2025-12-11", 12)).toBe("2026-12-05");
  });

  it("preserves an extended treatment end date for extra-pulmonary patients", () => {
    expect(
      resolvePatientTreatmentSchedule({
        tbType: "Extra-pulmonary",
        confirmationMethod: "CD",
        treatmentStartDate: "2026-05-01",
        drugStartDate: "2026-05-01",
        treatmentEndDate: "2026-12-31",
        metadata: { treatmentEndMode: "custom", treatmentLengthMonths: 6 },
      }),
    ).toEqual({
      ipEndDate: "2026-06-29",
      treatmentEndDate: "2026-12-31",
      protocolTreatmentEndDate: "2026-10-27",
    });

    expect(resolvePatientDotPlan({
      tbType: "Extra-pulmonary",
      treatmentStartDate: "2026-05-01",
      drugStartDate: "2026-05-01",
      treatmentEndDate: "2026-12-31",
      metadata: { treatmentEndMode: "custom", treatmentLengthMonths: 6 },
    })).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-12-31",
      totalDays: 245,
      source: "drug-start",
    });
  });

  it("defaults the doctor course end from drug start when no manual end date is entered", () => {
    expect(
      resolvePatientTreatmentSchedule({
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        treatmentStartDate: "2026-01-01",
        drugStartDate: "2026-01-14",
      }),
    ).toEqual({
      ipEndDate: "2026-03-14",
      treatmentEndDate: "2026-07-12",
      protocolTreatmentEndDate: "2026-07-12",
      sputumDueDates: {
        "2M": "2026-03-14",
        "5M": "2026-06-12",
        "6M": "2026-07-12",
      },
    });
  });

  it("uses the drug regimen start and default treatment length over stale stored end dates", () => {
    expect(
      resolvePatientTreatmentSchedule({
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        treatmentStartDate: "2026-05-01",
        drugStartDate: "2026-05-10",
      treatmentEndDate: "2026-12-31",
      }),
    ).toEqual({
      ipEndDate: "2026-07-08",
      treatmentEndDate: "2026-11-05",
      protocolTreatmentEndDate: "2026-11-05",
      sputumDueDates: {
        "2M": "2026-07-08",
        "5M": "2026-10-06",
        "6M": "2026-11-05",
      },
    });
  });

  it("creates only 2M sputum follow-up for pulmonary CD patients", () => {
    expect(
      resolvePatientTreatmentSchedule({
        tbType: "Pulmonary",
        confirmationMethod: "CD",
        treatmentStartDate: "2026-05-01",
        drugStartDate: "2026-05-10",
      }),
    ).toEqual({
      ipEndDate: "2026-07-08",
      treatmentEndDate: "2026-11-05",
      protocolTreatmentEndDate: "2026-11-05",
      sputumDueDates: {
        "2M": "2026-07-08",
      },
    });
  });

  it("uses treatment length metadata from drug start over a stale stored treatment end", () => {
    expect(
      resolvePatientTreatmentSchedule({
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        treatmentStartDate: "2025-12-11",
        drugStartDate: "2026-01-10",
        treatmentEndDate: "2026-06-08",
        metadata: { treatmentLengthMonths: 9 },
      }),
    ).toEqual({
      ipEndDate: "2026-03-10",
      treatmentEndDate: "2026-10-06",
      protocolTreatmentEndDate: "2026-07-08",
      sputumDueDates: {
        "2M": "2026-03-10",
        "5M": "2026-06-08",
        "6M": "2026-07-08",
      },
    });

    expect(resolvePatientDotPlan({
      tbType: "Pulmonary",
      treatmentStartDate: "2025-12-11",
      drugStartDate: "2026-01-10",
      treatmentEndDate: "2026-06-08",
      metadata: { treatmentLengthMonths: 9 },
    })).toEqual({
      startDate: "2026-01-10",
      endDate: "2026-10-06",
      totalDays: 270,
      source: "drug-start",
    });
  });

  it("uses drug start date for DOT medicine tracking and treatment end for total course", () => {
    expect(resolvePatientDotPlan({
      tbType: "Extra-pulmonary",
      treatmentStartDate: "2025-12-29",
      drugStartDate: "2026-01-14",
      treatmentEndDate: "2026-10-14",
      metadata: { treatmentLengthMonths: 9 },
    })).toEqual({
      startDate: "2026-01-14",
      endDate: "2026-10-10",
      totalDays: 270,
      source: "drug-start",
    });
  });

  it("calculates TPT end dates with fixed 30-day programme months", () => {
    expect(calculateTptEndDate("2026-05-01", "3HR")).toBe("2026-07-29");
    expect(calculateTptEndDate("2026-05-01", "6H")).toBe("2026-10-27");
  });

  it("resolves previous patient entry mode against the 15/05/2026 cutoff", () => {
    const historicalPatient = { ...basePatient, registrationDate: "2026-05-01", treatmentStartDate: "2026-05-01" };

    expect(resolvePatientEntryMode(historicalPatient, "2026-05-15")).toMatchObject({
      entryMode: "historical",
      entryModeSource: "auto",
      historicalCutoffDate: "2026-05-15",
    });

    expect(resolvePatientEntryMode({
      ...historicalPatient,
      metadata: { entryMode: "live", entryModeSource: "manual", historicalCutoffDate: "2026-05-15" },
    }, "2026-05-15")).toMatchObject({
      entryMode: "live",
      entryModeSource: "manual",
    });

    expect(withResolvedPatientEntryMetadata(historicalPatient, "2026-05-15").metadata).toEqual(expect.objectContaining({
      entryMode: "historical",
      historicalCutoffDate: "2026-05-15",
    }));
  });

  it("marks drug-start-only old records as previous patient data", () => {
    expect(resolvePatientEntryMode({
      ...basePatient,
      registrationDate: "2026-05-15",
      treatmentStartDate: "",
      drugStartDate: "2026-05-01",
    }, "2026-05-15")).toMatchObject({
      entryMode: "historical",
      historicalReason: "Drug start date is before 15/05/2026",
    });
  });

  it("logs historical DOT back-entry quietly only before the fixed cutoff date", () => {
    const historicalPatient = { ...basePatient, treatmentStartDate: "2026-05-01" };

    expect(shouldCreateLiveDiaryEntry(historicalPatient, "2026-05-14", "DOT Updated", "2026-05-15")).toBe(false);
    expect(shouldCreateLiveDiaryEntry(historicalPatient, "2026-05-15", "DOT Updated", "2026-05-15")).toBe(true);
  });

  it("detects duplicate TR and name-phone combinations", () => {
    expect(
      detectDuplicatePatient(
        { tr: "131/26", name: "রহিম উদ্দিন", phone: "01711111111" },
        [basePatient],
      ),
    ).toEqual(["TR_DUPLICATE", "NAME_PHONE_DUPLICATE"]);
  });

  it("generates worklist items from lab, DOT, CI, and outcome rules", () => {
    const patients: Patient[] = [
      { ...basePatient, treatmentStartDate: "", treatmentEndDate: "", phase: "Pre-treatment" },
      { ...basePatient, id: "pat_2", tr: "132/26", name: "ফাতেমা বেগম", nextFollowUpDate: "2026-05-12" },
      { ...basePatient, id: "pat_3", tr: "133/26", name: "করিম আলী", treatmentEndDate: "2026-05-01", outcome: "" },
    ];
    const labs: LabResult[] = [
      {
        id: "lab_1",
        patientId: "pat_1",
        testType: "GeneXpert",
        result: "RR — MTB Detected, Rif Resistant",
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    ];
    const dots: DotEntry[] = [
      {
        id: "dot_1",
        patientId: "pat_2",
        date: "2026-05-12",
        monthKey: "2026-05",
        day: 12,
        status: "missed",
        updatedAt: "2026-05-12T00:00:00.000Z",
      },
    ];

    const tasks = generateWorklist({
      today: "2026-05-13",
      patients,
      labResults: labs,
      dotEntries: dots,
      contacts: [],
      tptRecords: [],
    });

    expect(tasks.map((task) => task.type)).toEqual(
      expect.arrayContaining([
        "DR_TB_REFERRAL",
        "TREATMENT_START_PENDING",
        "DOT_MISSED",
        "FOLLOWUP_OVERDUE",
        "CI_PENDING",
        "OUTCOME_PENDING",
      ]),
    );
  });

  it("does not generate sputum worklist tasks for extra-pulmonary patients", () => {
    const tasks = generateWorklist({
      today: "2026-05-30",
      patients: [
        {
          ...basePatient,
          id: "pat_ep",
          tbType: "Extra-pulmonary",
          treatmentEndDate: "2026-09-01",
        },
      ],
      labResults: [],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
    });

    expect(tasks.some((task) => /sputum/i.test(`${task.title} ${task.description}`))).toBe(false);
  });

  it("generates only 2M sputum work for pulmonary CD patients", () => {
    const cdPatient: Patient = {
      ...basePatient,
      id: "pat_cd",
      confirmationMethod: "CD",
      treatmentStartDate: "2026-04-01",
      drugStartDate: "2026-04-01",
      treatmentEndDate: "2026-09-27",
    };

    const twoMonthTasks = generateWorklist({
      today: "2026-05-30",
      patients: [cdPatient],
      labResults: [],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
    });
    expect(twoMonthTasks.some((task) => /2M sputum/i.test(task.title))).toBe(true);

    const fiveMonthTasks = generateWorklist({
      today: "2026-08-28",
      patients: [cdPatient],
      labResults: [],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
    });
    expect(fiveMonthTasks.some((task) => /5M sputum|6M sputum/i.test(task.title))).toBe(false);
  });

  it("continues tracking missing work for previous patient back-entry records", () => {
    const historicalPatient: Patient = {
      ...basePatient,
      id: "pat_history",
      treatmentStartDate: "2026-03-03",
      drugStartDate: "2026-03-03",
      nextFollowUpDate: "2026-05-01",
      metadata: { entryMode: "historical", entryModeSource: "manual", historicalCutoffDate: "2026-05-15" },
    };

    const tasks = generateWorklist({
      today: "2026-05-15",
      patients: [historicalPatient],
      labResults: [],
      dotEntries: [{
        id: "dot_old",
        patientId: "pat_history",
        date: "2026-05-01",
        monthKey: "2026-05",
        day: 1,
        status: "missed",
        updatedAt: "2026-05-01T00:00:00.000Z",
      }],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
    });

    expect(tasks.map((task) => task.type)).toEqual(expect.arrayContaining(["DOT_MISSED", "DOT_NOT_UPDATED", "FOLLOWUP_OVERDUE", "CI_PENDING", "FOLLOWUP_DUE"]));
    expect(tasks.some((task) => task.type === "DOT_NOT_UPDATED" && /DOT day update missing/.test(task.description || ""))).toBe(true);
    expect(tasks.some((task) => /2M sputum/i.test(task.title))).toBe(true);
  });

  it("creates DOT incomplete work from drug start instead of clinical treatment start", () => {
    const tasks = generateWorklist({
      today: "2026-05-12",
      patients: [{
        ...basePatient,
        id: "pat_drug_start",
        treatmentStartDate: "2026-01-01",
        drugStartDate: "2026-05-10",
        treatmentEndDate: "2026-11-05",
      }],
      labResults: [],
      dotEntries: [{
        id: "dot_done",
        patientId: "pat_drug_start",
        date: "2026-05-10",
        monthKey: "2026-05",
        day: 10,
        status: "done",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
    });

    const dotTask = tasks.find((task) => task.type === "DOT_NOT_UPDATED");
    expect(dotTask?.dueDate).toBe("2026-05-12");
    expect(dotTask?.description).toContain("2 DOT day update missing");
    expect(dotTask?.description).toContain("11/05/2026 to 12/05/2026");
  });

  it("does not generate a sputum task after that stage is completed", () => {
    const sputumFollowUps: SputumFollowUp[] = [
      {
        id: "sp_5m",
        patientId: "pat_1",
        stage: "5M",
        dueDate: "2026-06-01",
        testDate: "2026-06-02",
        microscopyResult: "Negative",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    ];

    const tasks = generateWorklist({
      today: "2026-05-30",
      patients: [{ ...basePatient, treatmentStartDate: "2026-01-01", drugStartDate: "2026-01-01" }],
      labResults: [],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
      sputumFollowUps,
    });

    expect(tasks.some((task) => /5M sputum/i.test(task.title))).toBe(false);
  });

  it("keeps old overdue sputum follow-up visible in the worklist", () => {
    const tasks = generateWorklist({
      today: "2026-08-15",
      patients: [{
        ...basePatient,
        id: "pat_old_sputum",
        treatmentStartDate: "2026-01-01",
        drugStartDate: "2026-01-01",
      }],
      labResults: [],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
    });

    expect(tasks.some((task) => task.type === "FOLLOWUP_DUE" && /2M sputum follow-up overdue/i.test(task.title))).toBe(true);
    expect(tasks.some((task) => task.type === "FOLLOWUP_DUE" && /5M sputum follow-up overdue/i.test(task.title))).toBe(true);
    expect(tasks.some((task) => task.type === "FOLLOWUP_DUE" && /6M sputum follow-up overdue/i.test(task.title))).toBe(true);
  });

  it("flags missing FO core fields, incomplete outcome sign-off, and sputum data issues", () => {
    const patients: Patient[] = [
      {
        ...basePatient,
        tr: "",
        registrationDate: "",
        phone: "01711111111",
        age: 28,
        regimenType: "CAT-1 / 4FDC",
        outcome: "Treatment Completed",
        outcomeDate: "",
        signOfficer: "",
      },
      {
        ...basePatient,
        id: "pat_ep",
        tbType: "Extra-pulmonary",
        phone: "01722222222",
        age: 34,
        registrationDate: "2026-01-01",
        regimenType: "CAT-1 / 4FDC",
      },
      {
        ...basePatient,
        id: "pat_pulm",
        phone: "01733333333",
        age: 44,
        registrationDate: "2026-01-01",
        regimenType: "CAT-1 / 4FDC",
        treatmentStartDate: "2026-01-01",
        drugStartDate: "2026-01-01",
      },
    ];

    const issues = detectDataQualityIssues(patients, [], [
      {
        id: "sp_ep",
        patientId: "pat_ep",
        stage: "2M",
        dueDate: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ], "2026-06-10");

    expect(issues.map((issue) => issue.issue)).toEqual(expect.arrayContaining([
      "TR / registration number missing",
      "Registration date missing",
      "Outcome date missing",
      "Outcome sign-off officer missing",
      "Drug start date missing for DOT tracking",
      "Patient weight missing for auto dose calculation",
      "DOT provider missing",
      "EP patient has sputum follow-up record",
      "5M sputum follow-up overdue",
    ]));
  });

  it("flags a doctor course end date before medicine start", () => {
    const issues = detectDataQualityIssues([{
      ...basePatient,
      drugStartDate: "2026-05-10",
      treatmentEndDate: "2026-05-01",
    }], [], [], "2026-05-15");

    expect(issues.map((issue) => issue.issue)).toContain("Treatment end date is before drug start date");
  });

  it("flags drug-start-driven tracking issues even if clinical treatment start is missing", () => {
    const issues = detectDataQualityIssues([{
      ...basePatient,
      treatmentStartDate: "",
      drugStartDate: "2026-05-10",
      treatmentEndDate: "2026-10-01",
      regimenType: "",
      dotProviderName: "",
      metadata: { treatmentLengthMonths: 6 },
    }], [], [], "2026-05-15");

    expect(issues.map((issue) => issue.issue)).toEqual(expect.arrayContaining([
      "Medicine tracking started but regimen is missing",
      "DOT provider missing",
      "Treatment end does not match selected 6-month course",
    ]));
  });

  it("builds Bangla-readable diary entries with patient context", () => {
    const entry = buildDiaryEntry({
      type: "DOT Updated",
      patient: basePatient,
      details: "DOT ১৩ মে ২০২৬ তারিখে আপডেট: Done",
      now: new Date("2026-05-13T10:30:00.000Z"),
      userName: "FO",
    });

    expect(entry).toMatchObject({
      date: "2026-05-13",
      type: "DOT Updated",
      patientId: "pat_1",
      tr: "131/26",
      patientName: "রহিম উদ্দিন",
      userName: "FO",
    });
  });

  it("calculates adult FDC tablet counts from patient weight and phase", () => {
    expect(calculateDrugDosePlan("CAT-1 / 4FDC", 75, "Intensive Phase")).toMatchObject({
      weightBand: "71+ kg",
      summary: "5 tablets/day for the active FDC phase",
      lines: [
        expect.objectContaining({ drug: "HRZE (4FDC)", tabletsPerDay: 5, selected: true, doseText: "5 tablets once daily" }),
        expect.objectContaining({ drug: "HR (2FDC)", tabletsPerDay: 5, selected: false }),
      ],
    });

    expect(calculateDrugDosePlan("CAT-1 / 4FDC", 51, "Continuation Phase")?.lines).toEqual([
      expect.objectContaining({ drug: "HRZE (4FDC)", tabletsPerDay: 3, selected: false }),
      expect.objectContaining({ drug: "HR (2FDC)", tabletsPerDay: 3, selected: true, doseText: "3 tablets once daily" }),
    ]);
  });

  it("calculates paediatric FDC tablets only inside child weight bands", () => {
    expect(calculateDrugDosePlan("3FDC (Paediatric)", 10, "Intensive Phase")).toMatchObject({
      weightBand: "8-11 kg",
      summary: "2 child FDC tablets/day",
      lines: [
        expect.objectContaining({ drug: "HRZ (3FDC)", tabletsPerDay: 2, selected: true }),
        expect.objectContaining({ drug: "HR (2FDC)", tabletsPerDay: 2, selected: false }),
      ],
    });

    expect(calculateDrugDosePlan("3FDC (Paediatric)", 30, "Intensive Phase")).toMatchObject({
      weightBand: undefined,
      summary: "Use paediatric review if weight is outside 4-24 kg",
    });
  });

  it("does not auto-calculate individualized regimens", () => {
    expect(calculateDrugDosePlan("DR-TB / MDR", 60, "Intensive Phase")).toMatchObject({
      summary: "DR-TB/MDR regimens are individualized and must not be auto-calculated here.",
      lines: [expect.objectContaining({ doseText: "Verify manually" })],
    });
  });
});
