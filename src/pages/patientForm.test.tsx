import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DotEntry, LabResult, Patient, RecordAttachment } from "../domain/types";
import { PatientFormPage } from "./PatientFormPage";

const patient: Patient = {
  id: "patient-1",
  name: "Amina Begum",
  tr: "TR-001",
  phase: "Pre-treatment",
  tbType: "Pulmonary",
  confirmationMethod: "BC",
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
};

const attachment: RecordAttachment = {
  id: "att-1",
  recordType: "patient",
  recordId: "patient-1",
  fileName: "xray-report.pdf",
  fileType: "application/pdf",
  fileSize: 2048,
  bucket: "record-attachments",
  storageKey: "user-1/patient-1/xray-report.pdf",
  url: "https://storage.example/xray-report.pdf",
  uploadedBy: "user-1",
  createdAt: "2026-05-15T00:00:00.000Z",
};

const dotEntries: DotEntry[] = [
  { id: "dot-1", patientId: "patient-1", date: "2026-05-01", monthKey: "2026-05", day: 1, status: "done", updatedAt: "2026-05-01T00:00:00.000Z" },
  { id: "dot-61", patientId: "patient-1", date: "2026-06-30", monthKey: "2026-06", day: 30, status: "supervised", updatedAt: "2026-06-30T00:00:00.000Z" },
];

const renderPatientForm = (props: Partial<ComponentProps<typeof PatientFormPage>> = {}) => {
  const defaults = {
    patients: [patient],
    attachments: [attachment],
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onSaveLab: vi.fn(),
    onDeleteLab: vi.fn(),
    onSaveDot: vi.fn(),
    onSaveContact: vi.fn(),
    onSaveTpt: vi.fn(),
    onSaveSputum: vi.fn(),
    onUploadAttachment: vi.fn(),
    onOpenAttachment: vi.fn(),
  };

  return render(
    <MemoryRouter initialEntries={["/patients/patient-1"]}>
      <Routes>
        <Route path="/patients/:patientId" element={<PatientFormPage {...defaults} {...props} />} />
      </Routes>
    </MemoryRouter>
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PatientFormPage attachments", () => {
  it("shows attachments and opens an uploaded file", () => {
    const onOpenAttachment = vi.fn();

    renderPatientForm({ onOpenAttachment });

    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByText("xray-report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/application\/pdf - 2 KB - 15\/05\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open/i }));

    expect(onOpenAttachment).toHaveBeenCalledWith(attachment);
  });

  it("uploads a selected file for the current patient", async () => {
    const onUploadAttachment = vi.fn().mockResolvedValue(undefined);
    const file = new File(["sample"], "prescription.pdf", { type: "application/pdf" });

    renderPatientForm({ attachments: [], onUploadAttachment });

    fireEvent.change(screen.getByLabelText(/upload file/i), { target: { files: [file] } });

    await waitFor(() => expect(onUploadAttachment).toHaveBeenCalledWith("patient-1", file));
    expect(await screen.findByText("prescription.pdf uploaded.")).toBeInTheDocument();
  });

  it("captures current GPS location and saves it to patient metadata", async () => {
    const onSave = vi.fn();
    const getCurrentPosition = vi.fn((success) => success({
      coords: { latitude: 23.810331, longitude: 90.412521, accuracy: 12 },
    }));
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    renderPatientForm({ attachments: [], onSave });

    fireEvent.click(screen.getByRole("button", { name: /use current gps/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        houseLocation: expect.objectContaining({
          latitude: 23.810331,
          longitude: 90.412521,
          accuracyMeters: 12,
          source: "gps",
        }),
      }),
    })));
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: true, timeout: 15000 }));
  });

  it("validates manual location input before saving", () => {
    const onSave = vi.fn();

    renderPatientForm({ attachments: [], onSave });

    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "91" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "90.412521" } });
    fireEvent.click(screen.getByRole("button", { name: /save manual point/i }));

    expect(screen.getByText("Latitude must be between -90 and 90.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a manual house location draft from the main Save button", () => {
    const onSave = vi.fn();

    renderPatientForm({ attachments: [], onSave });

    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "23.810331" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "90.412521" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        houseLocation: expect.objectContaining({
          latitude: 23.810331,
          longitude: 90.412521,
          source: "manual",
        }),
      }),
    }));
    expect(screen.getByText("House location saved.")).toBeInTheDocument();
  });

  it("opens, copies and clears a saved house location without losing other metadata", async () => {
    const onSave = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderPatientForm({
      onSave,
      patients: [{
        ...patient,
        metadata: {
          clinical: { hivStatus: "Negative" },
          houseLocation: {
            latitude: 23.810331,
            longitude: 90.412521,
            accuracyMeters: 8,
            capturedAt: "2026-05-16T10:00:00.000Z",
            source: "manual",
          },
        },
      }],
    });

    expect(screen.getByText("Patient house location saved.")).toBeInTheDocument();
    expect(screen.getByText("23.810331, 90.412521")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open google maps/i }));
    expect(openSpy).toHaveBeenCalledWith("https://www.google.com/maps?q=23.810331,90.412521", "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: /directions/i }));
    expect(openSpy).toHaveBeenCalledWith("https://www.google.com/maps/dir/?api=1&destination=23.810331,90.412521", "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://www.google.com/maps?q=23.810331,90.412521"));

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ clinical: { hivStatus: "Negative" } }),
    }));
    expect(onSave.mock.calls.at(-1)?.[0].metadata.houseLocation).toBeUndefined();
  });
});

describe("PatientFormPage extra-pulmonary treatment rules", () => {
  it("lets EP patients use an extended treatment end date and hides sputum follow-up UI", () => {
    const onSave = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          tbType: "Extra-pulmonary",
          epSite: "Lymph Node",
          treatmentStartDate: "2026-01-14",
          drugStartDate: "2026-01-14",
          treatmentEndDate: "2026-09-14",
          metadata: { treatmentEndMode: "custom" },
        },
      ],
      attachments: [],
      onSave,
    });

    expect(screen.getByLabelText(/EP treatment extended until/i)).toHaveValue("14/09/2026");
    expect(screen.getAllByText(/EP patient/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: /Sputum Follow-up/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sputum 2M/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/EP treatment extended until/i), { target: { value: "14/10/2026" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ treatmentEndDate: "2026-10-14" }));
  });

  it("keeps pulmonary sputum schedule visible", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          treatmentStartDate: "2026-05-01",
          drugStartDate: "2026-05-01",
        },
      ],
      attachments: [],
    });

    expect(screen.getByText(/IP End: 29\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Treatment End: 27\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sputum 2M: 29\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sputum 5M: 27\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sputum 6M: 27\/10\/2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sputum Follow-up/i).length).toBeGreaterThan(0);
  });

  it("shows only 2M sputum follow-up for pulmonary CD patients", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          confirmationMethod: "CD",
          treatmentStartDate: "2026-05-01",
          drugStartDate: "2026-05-10",
        },
      ],
      attachments: [],
    });

    expect(screen.getByText(/Sputum 2M: 08\/07\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Sputum 5M:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sputum 6M:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pulmonary CD follow-up/i)).toBeInTheDocument();
    expect(screen.getByText("2M Sputum Follow-up")).toBeInTheDocument();
    expect(screen.queryByText("5M Sputum Follow-up")).not.toBeInTheDocument();
    expect(screen.queryByText("6M Sputum Follow-up")).not.toBeInTheDocument();
  });
});

describe("PatientFormPage complete TB-01 data entry", () => {
  it("auto-marks previous patient data before 15/05/2026 and preserves manual override", () => {
    const onSave = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          registrationDate: "2026-05-01",
          treatmentStartDate: "2026-05-01",
        },
      ],
      attachments: [],
      onSave,
    });

    expect(screen.getByText("Previous patient data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous patient/i })).toHaveClass("selected");
    expect(screen.getByText(/Cutoff date: 15\/05\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Live patient/i }));
    expect(screen.getByRole("button", { name: /Live patient/i })).toHaveClass("selected");

    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        entryMode: "live",
        entryModeSource: "manual",
        historicalCutoffDate: "2026-05-15",
      }),
    }));
  });

  it("saves expanded identity, DOTS, treatment, and clinical screening fields", () => {
    const onSave = vi.fn();

    renderPatientForm({ attachments: [], onSave });

    fireEvent.change(screen.getByLabelText(/DOTS Plus No/i), { target: { value: "DOT-593/24" } });
    fireEvent.change(screen.getByLabelText(/e-TB Manager ID/i), { target: { value: "ETB-2026-1" } });
    fireEvent.change(screen.getByLabelText(/Registration date/i), { target: { value: "15/05/2026" } });
    fireEvent.change(screen.getByLabelText(/Contact Investigator/i), { target: { value: "Rahima Akter" } });
    fireEvent.change(screen.getByLabelText(/Referrer name/i), { target: { value: "CHCP Sirajdikha" } });
    fireEvent.change(screen.getByLabelText(/Drug start date/i), { target: { value: "16/05/2026" } });
    fireEvent.change(screen.getByLabelText(/BCG Scar/i), { target: { value: "Present" } });
    fireEvent.change(screen.getByLabelText(/HIV test/i), { target: { value: "Negative" } });
    fireEvent.change(screen.getByLabelText(/CPT start date/i), { target: { value: "17/05/2026" } });
    fireEvent.change(screen.getByLabelText(/ART start date/i), { target: { value: "18/05/2026" } });
    fireEvent.change(screen.getByLabelText(/COVID-19/i), { target: { value: "Not Done" } });
    fireEvent.change(screen.getByLabelText(/Malaria/i), { target: { value: "Negative" } });
    fireEvent.change(screen.getByLabelText(/Treatment history note/i), { target: { value: "Previous private treatment noted" } });
    fireEvent.change(screen.getByLabelText(/Drug reaction/i), { target: { value: "Mild nausea" } });
    fireEvent.change(screen.getByLabelText(/Clinical note/i), { target: { value: "Counselling completed" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      dotsNo: "DOT-593/24",
      etbId: "ETB-2026-1",
      registrationDate: "2026-05-15",
      contactInvestigatorName: "Rahima Akter",
      referrer: "CHCP Sirajdikha",
      drugStartDate: "2026-05-16",
      drugReaction: "Mild nausea",
      clinicalNote: "Counselling completed",
      metadata: expect.objectContaining({
        clinical: expect.objectContaining({
          bcgScar: "Present",
          hivStatus: "Negative",
          cptStartDate: "2026-05-17",
          artStartDate: "2026-05-18",
          covidStatus: "Not Done",
          malariaStatus: "Negative",
          treatmentHistoryNote: "Previous private treatment noted",
        }),
      }),
    }));
  });

  it("shows an automatic weight-based drug dose helper", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          regimenType: "CAT-1 / 4FDC",
          weightKg: 75,
          phase: "Intensive Phase",
        },
      ],
      attachments: [],
    });

    expect(screen.getByText("Auto dose helper")).toBeInTheDocument();
    expect(screen.getByText("71+ kg")).toBeInTheDocument();
    expect(screen.getAllByText("5 tabs/day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 tablets once daily").length).toBeGreaterThan(0);
    expect(screen.getByText(/FO must verify/i)).toBeInTheDocument();
  });

  it("shows 4FDC, 2FDC, and total DOT treatment progress", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          treatmentStartDate: "2026-05-01",
          drugStartDate: "2026-05-01",
        },
      ],
      dotEntries,
      attachments: [],
    });

    expect(screen.getByText("4FDC intensive")).toBeInTheDocument();
    expect(screen.getByText("2FDC continuation")).toBeInTheDocument();
    expect(screen.getByText("Total treatment")).toBeInTheDocument();
    expect(screen.getByText("1/60 days")).toBeInTheDocument();
    expect(screen.getByText("1/120 days")).toBeInTheDocument();
    expect(screen.getByText("2/180 days")).toBeInTheDocument();
    expect(screen.getByText("4FDC 60 days")).toBeInTheDocument();
    expect(screen.getByText("2FDC 120 days")).toBeInTheDocument();
    expect(screen.getByText(/01\/05\/2026 to 27\/10\/2026/)).toBeInTheDocument();
  });

  it("links EP drug extension date to DOT continuation tracking", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          tbType: "Extra-pulmonary",
          regimenType: "CAT-1 / 4FDC",
          weightKg: 40,
          phase: "Continuation Phase",
          treatmentStartDate: "2026-01-14",
          drugStartDate: "2026-01-14",
          treatmentEndDate: "2026-09-14",
          metadata: { treatmentLengthMonths: 9 },
        },
      ],
      attachments: [],
    });

    expect(screen.getByLabelText(/EP treatment extended until/i)).toHaveValue("10/10/2026");
    expect(screen.getByText("DOT follows Drug Regimen")).toBeInTheDocument();
    expect(screen.getByText("0/270 days")).toBeInTheDocument();
    expect(screen.getAllByText(/Day 61-270/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2FDC 210 days/)).toBeInTheDocument();
  });

  it("moves DOT tracking start to the Drug start date when it changes", () => {
    renderPatientForm({
      patients: [
        {
          ...patient,
          regimenType: "CAT-1 / 4FDC",
          weightKg: 40,
          treatmentStartDate: "2026-05-01",
        },
      ],
      attachments: [],
    });

    fireEvent.change(screen.getByLabelText(/Drug start date/i), { target: { value: "14/10/2025" } });

    expect(screen.getByText("10/2025")).toBeInTheDocument();
    expect(screen.getByText(/14\/10\/2025 to 11\/04\/2026/)).toBeInTheDocument();
    expect(screen.getByLabelText(/দিন 14, treatment day 1, 4FDC, 3 tabs\/day/i)).toBeInTheDocument();
  });

  it("calculates treatment end from selected 30-day treatment length", () => {
    const onSave = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          regimenType: "CAT-1 / 4FDC",
          weightKg: 40,
          treatmentStartDate: "2025-12-11",
          drugStartDate: "2025-12-11",
        },
      ],
      attachments: [],
      onSave,
    });

    fireEvent.change(screen.getByLabelText(/Treatment length/i), { target: { value: "9" } });

    expect(screen.getByLabelText(/^Treatment end date/i)).toHaveValue("06/09/2026");
    expect(screen.getByText(/11\/12\/2025 to 06\/09\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      treatmentEndDate: "2026-09-06",
      metadata: expect.objectContaining({ treatmentLengthMonths: 9 }),
    }));
  });

  it("derives saved treatment end from drug start and stored treatment length", () => {
    const onSave = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          treatmentStartDate: "2025-12-11",
          drugStartDate: "2026-01-10",
          treatmentEndDate: "2026-06-08",
          metadata: { treatmentLengthMonths: 9 },
        },
      ],
      attachments: [],
      onSave,
    });

    expect(screen.getByLabelText(/^Treatment end date/i)).toHaveValue("06/10/2026");
    expect(screen.getByText(/Sputum 2M: 10\/03\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sputum 5M: 08\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sputum 6M: 08\/07\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      treatmentEndDate: "2026-10-06",
    }));
  });

  it("saves treatment outcome sign-off details", () => {
    const onSave = vi.fn();

    renderPatientForm({ attachments: [], onSave });

    fireEvent.click(screen.getByRole("button", { name: /Cured/i }));
    fireEvent.change(screen.getByLabelText(/Outcome Date/i), { target: { value: "30/11/2026" } });
    fireEvent.change(screen.getByLabelText(/Sign officer/i), { target: { value: "Dr. Hasan" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "Cured",
      outcomeDate: "2026-11-30",
      signOfficer: "Dr. Hasan",
    }));
  });

  it("shows a guided diagnosis lab workbench and switches lab type cards", () => {
    renderPatientForm({ attachments: [] });

    expect(screen.getAllByText("GeneXpert / Truenat").length).toBeGreaterThan(0);
    expect(screen.getByText("Microscopy (Smear)")).toBeInTheDocument();
    expect(screen.getByText("X-ray & other")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Microscopy \(Smear\)/i }));

    expect(screen.getByLabelText(/Test Type/i)).toHaveValue("Microscopy");
  });

  it("saves detailed lab result fields", () => {
    const onSaveLab = vi.fn();

    renderPatientForm({ attachments: [], onSaveLab });

    fireEvent.change(screen.getByLabelText(/Test Date/i), { target: { value: "15/05/2026" } });
    fireEvent.change(screen.getByLabelText(/^Result/i), { target: { value: "MTB Detected" } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: "Low" } });
    fireEvent.change(screen.getByLabelText(/Scanty count/i), { target: { value: "4 AFB" } });
    fireEvent.change(screen.getByLabelText(/Lab notes/i), { target: { value: "Repeat if symptoms persist" } });
    fireEvent.click(screen.getByRole("button", { name: /Add lab result/i }));

    expect(onSaveLab).toHaveBeenCalledWith(expect.objectContaining({
      testDate: "2026-05-15",
      result: "MTB Detected",
      quantity: "Low",
      scantyCount: "4 AFB",
      notes: "Repeat if symptoms persist",
    }));
  });

  it("saves a dirty lab draft from the main Save button", () => {
    const onSave = vi.fn();
    const onSaveLab = vi.fn();

    renderPatientForm({ attachments: [], onSave, onSaveLab });

    fireEvent.change(screen.getByLabelText(/Lab ID/i), { target: { value: "GX-22" } });
    fireEvent.change(screen.getByLabelText(/Lab notes/i), { target: { value: "Report collected at field visit" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalled();
    expect(onSaveLab).toHaveBeenCalledWith(expect.objectContaining({
      patientId: "patient-1",
      testType: "GeneXpert",
      labId: "GX-22",
      notes: "Report collected at field visit",
      result: "",
    }));
  });

  it("saves a pending lab result when details are entered without a result", () => {
    const onSaveLab = vi.fn();

    renderPatientForm({ attachments: [], onSaveLab });

    fireEvent.change(screen.getByLabelText(/Lab ID/i), { target: { value: "PENDING-1" } });
    fireEvent.change(screen.getByLabelText(/Lab notes/i), { target: { value: "Result pending from lab" } });
    fireEvent.click(screen.getByRole("button", { name: /Add lab result/i }));

    expect(onSaveLab).toHaveBeenCalledWith(expect.objectContaining({
      labId: "PENDING-1",
      notes: "Result pending from lab",
      result: "",
    }));
  });

  it("normalizes X-ray lab entries to the canonical Xray value", () => {
    const onSaveLab = vi.fn();

    renderPatientForm({ attachments: [], onSaveLab });

    fireEvent.click(screen.getByRole("button", { name: /X-ray & other/i }));
    fireEvent.change(screen.getByLabelText(/Lab ID/i), { target: { value: "XR-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Add lab result/i }));

    expect(onSaveLab).toHaveBeenCalledWith(expect.objectContaining({
      testType: "Xray",
      labId: "XR-1",
    }));
  });

  it("renders saved lab result detail cards", () => {
    const savedLab: LabResult = {
      id: "lab-xray",
      patientId: "patient-1",
      testType: "Xray",
      labId: "XR-77",
      testDate: "2026-05-16",
      result: "",
      quantity: "Abnormal",
      scantyCount: "",
      notes: "Chest X-ray opacity",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    };

    renderPatientForm({ attachments: [], labResults: [savedLab] });

    expect(screen.getByLabelText("Saved lab results")).toBeInTheDocument();
    expect(screen.getAllByText("X-ray").length).toBeGreaterThan(0);
    expect(screen.getByText("XR-77")).toBeInTheDocument();
    expect(screen.getByText("Pending result")).toBeInTheDocument();
    expect(screen.getByText("Chest X-ray opacity")).toBeInTheDocument();
  });

  it("lets FO delete a saved lab report after confirmation", () => {
    const onDeleteLab = vi.fn();
    const savedLab: LabResult = {
      id: "lab-delete",
      patientId: "patient-1",
      testType: "GeneXpert",
      labId: "GX-19",
      testDate: "2026-05-16",
      result: "Pending result",
      quantity: "",
      scantyCount: "",
      notes: "",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPatientForm({ attachments: [], labResults: [savedLab], onDeleteLab });

    fireEvent.click(screen.getByRole("button", { name: /delete genexpert report gx-19/i }));

    expect(window.confirm).toHaveBeenCalledWith("Delete this lab report? This cannot be undone.");
    expect(onDeleteLab).toHaveBeenCalledWith("lab-delete");
  });

  it("saves detailed contact investigation fields", () => {
    const onSaveContact = vi.fn();

    renderPatientForm({ attachments: [], onSaveContact });

    fireEvent.change(screen.getByLabelText(/Contact Investigator/i), { target: { value: "Rahima Akter" } });
    fireEvent.change(screen.getByLabelText(/CI date/i), { target: { value: "20/05/2026" } });
    fireEvent.change(screen.getByLabelText(/CI investigator phone/i), { target: { value: "01711111111" } });
    fireEvent.change(screen.getByLabelText(/Contact নাম/i), { target: { value: "Karim" } });
    fireEvent.change(screen.getByLabelText(/Investigation code/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/CI result/i), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText(/Outcome code/i), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/TR\/TPT No/i), { target: { value: "TPT-1" } });
    fireEvent.change(screen.getByLabelText(/CI follow-up date/i), { target: { value: "30/05/2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Add contact/i }));

    expect(onSaveContact).toHaveBeenCalledWith(expect.objectContaining({
      ciDate: "2026-05-20",
      investigatorName: "Rahima Akter",
      investigatorPhone: "01711111111",
      name: "Karim",
      investigationCode: "2",
      result: "N",
      outcomeCode: "4",
      trOrTptNo: "TPT-1",
      followUpDate: "2026-05-30",
    }));
  });

  it("saves a named contact draft from the main Save button", () => {
    const onSaveContact = vi.fn();

    renderPatientForm({ attachments: [], onSaveContact });

    fireEvent.change(screen.getAllByLabelText(/^Contact/i)[1], { target: { value: "Karim" } });
    fireEvent.change(screen.getByLabelText(/CI result/i), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSaveContact).toHaveBeenCalledWith(expect.objectContaining({
      patientId: "patient-1",
      name: "Karim",
      result: "N",
    }));
  });

  it("warns when a dirty contact draft has no contact name", () => {
    const onSaveContact = vi.fn();

    renderPatientForm({ attachments: [], onSaveContact });

    fireEvent.change(screen.getByLabelText(/CI result/i), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSaveContact).not.toHaveBeenCalled();
    expect(screen.getByText("Contact draft was not saved because contact name is required.")).toBeInTheDocument();
  });

  it("starts TPT with a fixed 90-day expected end date", () => {
    const onSaveTpt = vi.fn();

    renderPatientForm({ attachments: [], onSaveTpt });

    fireEvent.click(screen.getByRole("button", { name: /Start TPT/i }));

    expect(onSaveTpt).toHaveBeenCalledWith(expect.objectContaining({
      regimen: "3HR",
      expectedEndDate: expect.any(String),
    }));
    const saved = onSaveTpt.mock.calls[0][0];
    const start = new Date(`${saved.startDate}T00:00:00.000Z`);
    const end = new Date(`${saved.expectedEndDate}T00:00:00.000Z`);
    expect(Math.round((end.getTime() - start.getTime()) / 86400000)).toBe(89);
  });

  it("saves sputum follow-up detail fields for pulmonary patients", () => {
    const onSaveSputum = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          treatmentStartDate: "2026-01-14",
          drugStartDate: "2026-01-14",
        },
      ],
      attachments: [],
      onSaveSputum,
    });

    fireEvent.change(screen.getByLabelText(/2M test date/i), { target: { value: "15/03/2026" } });
    fireEvent.change(screen.getByLabelText(/2M Lab ID/i), { target: { value: "LAB-2M" } });
    fireEvent.change(screen.getByLabelText(/2M Microscopy/i), { target: { value: "Negative" } });
    fireEvent.change(screen.getByLabelText(/2M GeneXpert\/Truenat/i), { target: { value: "N - MTB Not Detected" } });
    fireEvent.change(screen.getByLabelText(/2M Culture/i), { target: { value: "No growth" } });
    fireEvent.change(screen.getByLabelText(/2M Weight/i), { target: { value: "51" } });
    fireEvent.change(screen.getByLabelText(/2M Comment/i), { target: { value: "Good response" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 2M result/i }));

    expect(onSaveSputum).toHaveBeenCalledWith(expect.objectContaining({
      stage: "2M",
      dueDate: "2026-03-14",
      testDate: "2026-03-15",
      labId: "LAB-2M",
      microscopyResult: "Negative",
      geneXpertResult: "N - MTB Not Detected",
      culture: "No growth",
      weightKg: 51,
      comment: "Good response",
    }));
  });

  it("saves a dirty sputum draft from the main Save button", () => {
    const onSaveSputum = vi.fn();

    renderPatientForm({
      patients: [
        {
          ...patient,
          treatmentStartDate: "2026-01-14",
          drugStartDate: "2026-01-14",
        },
      ],
      attachments: [],
      onSaveSputum,
    });

    fireEvent.change(screen.getByLabelText(/2M Lab ID/i), { target: { value: "SP-2M" } });
    fireEvent.change(screen.getByLabelText(/2M Microscopy/i), { target: { value: "Negative" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSaveSputum).toHaveBeenCalledWith(expect.objectContaining({
      stage: "2M",
      dueDate: "2026-03-14",
      labId: "SP-2M",
      microscopyResult: "Negative",
    }));
  });
});
