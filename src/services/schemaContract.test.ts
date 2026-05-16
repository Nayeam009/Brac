import { describe, expect, it } from "vitest";
import schema from "../../db/schema.sql?raw";

const tableBlock = (tableName: string): string => {
  const match = schema.match(new RegExp(`create table if not exists ${tableName} \\(([\\s\\S]*?)\\n\\);`));
  return match?.[1] || "";
};

describe("database schema contract", () => {
  it("supports the full sputum follow-up payload saved by the FO form", () => {
    const sputum = tableBlock("sputum_followups");

    expect(sputum).toContain("due_date date");
    expect(sputum).toContain("microscopy_result text");
    expect(sputum).toContain("gene_xpert_result text");
    expect(sputum).toContain("created_at timestamptz not null default now()");
  });

  it("cascades patient-linked child records on patient deletion", () => {
    const tpt = tableBlock("tpt_records");
    const attachments = tableBlock("record_attachments");

    expect(tpt).toContain("patient_id text references patients(id) on delete cascade");
    expect(attachments).toContain("record_id text not null references patients(id) on delete cascade");
  });
});
