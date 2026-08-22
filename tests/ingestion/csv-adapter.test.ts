import { describe, expect, it } from "vitest";
import { TrusteeSaleCsvAdapter } from "../../src/adapters/csv/csv-adapter";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";

const header = "source,county,apn,address,ownerName,arvLow,arvHigh,repairsLow,repairsHigh,debtLow,debtHigh,ownerConfidence,dataConfidence";
const row = 'TEST,Maricopa,105-82-001-A,"3744 W Chipman Rd, Phoenix, AZ",Jane Owner,390000,430000,25000,40000,190000,210000,0.9,0.85';

describe("CSV ingestion", () => {
  it("parses quoted fields and preserves raw provenance", () => {
    const [result] = new TrusteeSaleCsvAdapter().parse(`${header}\n${row}`);
    expect(result?.raw.address).toBe("3744 W Chipman Rd, Phoenix, AZ");
    expect(result?.parserVersion).toBe("csv-v1");
  });

  it("detects duplicate county/APN records inside a batch", () => {
    const records = new TrusteeSaleCsvAdapter().parse(`${header}\n${row}\n${row}`);
    const seenKeys = new Set<string>();
    const evaluations = records.map((record) => evaluateOpportunity(record.normalized, { seenKeys, now: new Date("2026-08-22T12:00:00Z") }));
    expect(evaluations[0]?.duplicate).toBe(false);
    expect(evaluations[1]?.reasons[0]?.code).toBe("REJECT_DUPLICATE");
  });

  it("rejects unknown columns instead of silently discarding them", () => {
    expect(() => new TrusteeSaleCsvAdapter().parse(`${header},mystery\n${row},value`)).toThrow("Unknown CSV columns");
  });
});
