// Types for scripts/years-schema.mjs, so src/engine/years.test.ts can run
// the validator's checks under the type checker.
import type { ZodTypeAny } from 'zod';

export const YearDriver: ZodTypeAny;
export const Year: ZodTypeAny;
export const YearsFile: ZodTypeAny;

export function checkYears(
  yearsFile: { years: unknown[] },
  nodes: Map<string, unknown>,
  sources: Map<string, unknown>,
  usedSources?: Set<string>,
): string[];
