/** Local recognition budget, not an editor/import/API limit. See SAFE_MODE_SQL_CLASSIFIER.md. */
export const SQL_CLASSIFICATION_LIMITS = Object.freeze({
  sqlCodeUnits: 262_144,
  tokens: 32_768,
  statements: 256,
  depth: 32,
  structures: 512,
  evidence: 4_096,
});

export class ClassificationLimitExceeded extends Error {
  constructor(readonly resource: keyof typeof SQL_CLASSIFICATION_LIMITS) {
    super(`limit-exceeded:${resource}`);
  }
}

export function checkLimit(resource: keyof typeof SQL_CLASSIFICATION_LIMITS, count: number): void {
  if (count > SQL_CLASSIFICATION_LIMITS[resource]) throw new ClassificationLimitExceeded(resource);
}
