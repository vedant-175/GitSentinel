import test from 'node:test';
import assert from 'node:assert/strict';
import { getRepositoryAnalytics, getGlobalAnalytics } from './analytics.js';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';

test('getGlobalAnalytics handles empty installation IDs gracefully', async () => {
  const result = await getGlobalAnalytics([]);
  assert.deepEqual(result.weeklyTrends, []);
  assert.equal(result.latency.p50Ms, 0);
  assert.equal(result.latency.p95Ms, 0);
  assert.deepEqual(result.severityBreakdown, []);
  assert.deepEqual(result.categoryBreakdown, []);
  assert.deepEqual(result.topFiles, []);
});

test('getRepositoryAnalytics returns valid SQL aggregated metrics for a repo', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  // Find any existing repo, or use dummy ID 999999
  const existingRepo = await prisma.repository.findFirst();
  const repoId = existingRepo?.id || 999999;

  const result = await getRepositoryAnalytics(repoId);

  assert.ok(Array.isArray(result.weeklyTrends), 'weeklyTrends should be an array');
  assert.ok(typeof result.latency === 'object', 'latency should be an object');
  assert.ok(typeof result.latency.p50Ms === 'number', 'p50Ms should be a number');
  assert.ok(typeof result.latency.p95Ms === 'number', 'p95Ms should be a number');
  assert.ok(Array.isArray(result.topFiles), 'topFiles should be an array');
  assert.ok(Array.isArray(result.severityBreakdown), 'severityBreakdown should be an array');
  assert.ok(Array.isArray(result.categoryBreakdown), 'categoryBreakdown should be an array');

  // Verify explicit CASE ordering if multiple severities exist
  if (result.severityBreakdown.length > 1) {
    const severities = result.severityBreakdown.map((s) => s.severity);
    const weight: Record<string, number> = { critical: 1, warning: 2, suggestion: 3 };
    for (let i = 0; i < severities.length - 1; i++) {
      const curr = weight[severities[i]] || 4;
      const next = weight[severities[i + 1]] || 4;
      assert.ok(
        curr <= next,
        `Severities should be sorted in explicit CASE order: ${severities[i]} (${curr}) <= ${severities[i + 1]} (${next})`
      );
    }
  }
});
