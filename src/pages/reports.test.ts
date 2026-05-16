import { describe, expect, it } from "vitest";
import { derivePatientsForReportExport, deriveTptRecordsForReportExport, formatReportDatesForExport } from "./ReportsPage";

describe("report date export formatting", () => {
  it("formats user-facing report dates as dd/mm/yyyy", () => {
    expect(formatReportDatesForExport({
      name: "Amina",
      treatmentStartDate: "2026-05-15",
      createdAt: "2026-05-15T10:30:00.000",
      completedAt: "2026-05-15T12:00:00.000",
      time: "2026-05-15T00:00:00.000",
      nested: { dueDate: "2026-06-01" },
    })).toEqual({
      name: "Amina",
      treatmentStartDate: "15/05/2026",
      createdAt: "15/05/2026 10:30am",
      completedAt: "15/05/2026 12:00pm",
      time: "15/05/2026 12:00am",
      nested: { dueDate: "01/06/2026" },
    });
  });

  it("derives IP dates while preserving doctor course end dates for reports", () => {
    expect(
      derivePatientsForReportExport([
        {
          id: "pat_1",
          name: "Amina",
          tbType: "Pulmonary",
          treatmentStartDate: "2026-05-01",
          ipEndDate: "2026-07-01",
          treatmentEndDate: "2026-11-01",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "pat_ep",
          name: "Karim",
          tbType: "Extra-pulmonary",
          treatmentStartDate: "2026-05-01",
          treatmentEndDate: "2026-12-31",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        ipEndDate: "2026-06-29",
        treatmentEndDate: "2026-11-01",
      }),
      expect.objectContaining({
        ipEndDate: "2026-06-29",
        treatmentEndDate: "2026-12-31",
      }),
    ]);
  });

  it("derives TPT expected end dates with fixed programme-day math for reports", () => {
    expect(
      deriveTptRecordsForReportExport([
        {
          id: "tpt_1",
          patientId: "pat_1",
          name: "Household contact",
          status: "Active",
          regimen: "6H",
          startDate: "2026-05-01",
          expectedEndDate: "2026-11-01",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        expectedEndDate: "2026-10-27",
      }),
    ]);
  });
});
