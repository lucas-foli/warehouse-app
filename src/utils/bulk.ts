export type BulkFailure = { id: string; reason: string };
export type BulkResult = { succeeded: number; failed: BulkFailure[] };

export const chunked = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) throw new Error('chunked: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

export const aggregateBulkResults = (results: BulkResult[]): BulkResult =>
  results.reduce<BulkResult>(
    (acc, r) => ({ succeeded: acc.succeeded + r.succeeded, failed: [...acc.failed, ...r.failed] }),
    { succeeded: 0, failed: [] },
  );
