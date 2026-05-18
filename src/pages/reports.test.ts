import { describe, expect, it } from "vitest";
import { deriveCriticalInfoRows, derivePatientsForReportExport, deriveTptRecordsForReportExport, formatReportDatesForExport } from "./ReportsPage";

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
          drugStartDate: "2026-05-01",
          ipEndDate: "2026-07-01",
          treatmentEndDate: "2026-11-01",
          metadata: { treatmentEndMode: "custom" },
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "pat_ep",
          name: "Karim",
          tbType: "Extra-pulmonary",
          treatmentStartDate: "2026-05-01",
          drugStartDate: "2026-05-01",
          treatmentEndDate: "2026-12-31",
          metadata: { treatmentEndMode: "custom" },
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

  it("builds critical info rows by location with drug-start monthly dates and sputum details", () => {
    const rows = deriveCriticalInfoRows([
      {
        id: "pat_bc",
        tr: "173/26",
        name: "Sujon",
        age: 35,
        phone: "01800000000",
        union: "Ichhapura",
        ward: "4",
        upazila: "Sirajdikhan",
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        drugStartDate: "2026-05-01",
        dotProviderName: "Rina SS",
        ssPhone: "01700000000",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "pat_ep",
        name: "Karim",
        address: "Village B",
        tbType: "Extra-pulmonary",
        drugStartDate: "2026-05-01",
        treatmentEndDate: "2026-12-26",
        metadata: { treatmentEndMode: "custom" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ], [
      {
        id: "sp_2m",
        patientId: "pat_bc",
        stage: "2M",
        testDate: "2026-06-30",
        microscopyResult: "Negative",
        geneXpertResult: "MTB Not Detected",
        weightKg: 48,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
      },
    ]);

    expect(rows[0]).toEqual(expect.objectContaining({
      location: "Ichhapura - Ward 4 - Sirajdikhan",
      tr: "173/26",
      dotName: "Rina SS",
      dotPhone: "01700000000",
      ipEndDate: "2026-06-29",
      treatmentEndDate: "2026-10-27",
    }));
    expect(rows[0].monthlyFollowUps.slice(0, 2)).toEqual([
      { label: "1M", date: "2026-05-30" },
      { label: "2M", date: "2026-06-29" },
    ]);
    expect(rows[0].sputum).toEqual([
      expect.objectContaining({ stage: "2M", dueDate: "2026-06-29", testDate: "2026-06-30", result: "Negative / MTB Not Detected", weight: "48 kg" }),
      expect.objectContaining({ stage: "5M", dueDate: "2026-09-27", result: "Pending" }),
      expect.objectContaining({ stage: "6M", dueDate: "2026-10-27", result: "Pending" }),
    ]);
    expect(rows[1].location).toBe("Village B");
    expect(rows[1].sputum).toEqual([]);
    expect(rows[1].monthlyFollowUps).toHaveLength(8);
  });
});
