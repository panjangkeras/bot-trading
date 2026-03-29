import { getPerformanceSummary } from '../services/performanceReview.js';
import { getCerebrasPerformanceReview } from '../services/cerebrasReview.js';
import { insertPerformanceReview } from '../services/reviewStore.js';

export async function runPerformanceReview() {
  const summary = await getPerformanceSummary();
  const advisory = await getCerebrasPerformanceReview(summary);
  await insertPerformanceReview({
    summary: summary as unknown as Record<string, unknown>,
    advisory
  });
  return { summary, advisory };
}
