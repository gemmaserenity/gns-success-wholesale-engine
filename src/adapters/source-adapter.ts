import type { RawLeadInput } from "../domain/opportunities/types";

export interface SourceEnvelope {
  source: string;
  retrievedAt: string;
  parserVersion: string;
  raw: Record<string, string>;
  normalized: RawLeadInput;
  confidence: number;
}

export interface SourceAdapter<TInput> {
  readonly sourceName: string;
  readonly parserVersion: string;
  parse(input: TInput, retrievedAt?: Date): SourceEnvelope[];
}
