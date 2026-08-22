import type { RawLeadInput } from "../../domain/opportunities/types";
import type { SourceAdapter, SourceEnvelope } from "../source-adapter";

const expectedHeaders = [
  "source", "sourceRecordId", "sourceUrl", "county", "apn", "address", "ownerName",
  "trusteeSaleDate", "recordedDate", "propertyType", "squareFeet", "yearBuilt", "arvLow",
  "arvHigh", "repairsLow", "repairsHigh", "debtLow", "debtHigh", "liens",
  "proposedContractPrice", "ownerConfidence", "dataConfidence", "buyerDemandScore",
  "propertyDesirabilityScore", "contactabilityScore", "titleComplexity", "ownerMismatch",
] as const;

function parseRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value: ${value}`);
  return parsed;
}

function toBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return ["true", "yes", "1"].includes(value.toLowerCase());
}

export class TrusteeSaleCsvAdapter implements SourceAdapter<string> {
  readonly sourceName = "OPERATOR_CSV";
  readonly parserVersion = "csv-v1";

  parse(csv: string, retrievedAt = new Date()): SourceEnvelope[] {
    const rows = parseRows(csv.replace(/^\uFEFF/, ""));
    const headers = rows.shift();
    if (!headers) throw new Error("CSV is empty");
    const unknown = headers.filter((header) => !expectedHeaders.includes(header as typeof expectedHeaders[number]));
    if (unknown.length) throw new Error(`Unknown CSV columns: ${unknown.join(", ")}`);
    const required = ["county", "apn", "address", "ownerName", "arvLow", "arvHigh", "repairsLow", "repairsHigh", "debtLow", "debtHigh", "ownerConfidence", "dataConfidence"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(", ")}`);

    return rows.map((values, rowIndex) => {
      const raw = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const requiredNumber = (name: string): number => {
        const value = toNumber(raw[name]);
        if (value === undefined) throw new Error(`Row ${rowIndex + 2}: ${name} is required`);
        return value;
      };
      const normalized: RawLeadInput = {
        source: raw.source || this.sourceName,
        sourceRecordId: raw.sourceRecordId || undefined,
        sourceUrl: raw.sourceUrl || undefined,
        county: raw.county ?? "",
        apn: raw.apn ?? "",
        address: raw.address ?? "",
        ownerName: raw.ownerName ?? "",
        trusteeSaleDate: raw.trusteeSaleDate || undefined,
        recordedDate: raw.recordedDate || undefined,
        propertyType: raw.propertyType || undefined,
        squareFeet: toNumber(raw.squareFeet),
        yearBuilt: toNumber(raw.yearBuilt),
        arvLow: requiredNumber("arvLow"),
        arvHigh: requiredNumber("arvHigh"),
        repairsLow: requiredNumber("repairsLow"),
        repairsHigh: requiredNumber("repairsHigh"),
        debtLow: requiredNumber("debtLow"),
        debtHigh: requiredNumber("debtHigh"),
        liens: toNumber(raw.liens),
        proposedContractPrice: toNumber(raw.proposedContractPrice),
        ownerConfidence: requiredNumber("ownerConfidence"),
        dataConfidence: requiredNumber("dataConfidence"),
        buyerDemandScore: toNumber(raw.buyerDemandScore),
        propertyDesirabilityScore: toNumber(raw.propertyDesirabilityScore),
        contactabilityScore: toNumber(raw.contactabilityScore),
        titleComplexity: toBoolean(raw.titleComplexity),
        ownerMismatch: toBoolean(raw.ownerMismatch),
      };
      return { source: normalized.source, retrievedAt: retrievedAt.toISOString(), parserVersion: this.parserVersion, raw, normalized, confidence: normalized.dataConfidence };
    });
  }
}
