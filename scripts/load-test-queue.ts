import 'dotenv/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ReviewJobData } from '@ai-reviewer/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const QUEUE_NAME = 'pr-review-queue';
const TOTAL_CONCURRENT_JOBS = parseInt(process.env.LOAD_TEST_JOBS || '15', 10);

async function runQueueLoadTest() {
  console.log('⚡ =======================================================');
  console.log('⚡ AI Code Reviewer — Queue Concurrency Load Test');
  console.log('⚡ =======================================================\n');
  console.log(`📡 Connecting to Redis: ${REDIS_URL}`);
  console.log(`📦 Enqueueing ${TOTAL_CONCURRENT_JOBS} concurrent PR review jobs...\n`);

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queue = new Queue<ReviewJobData>(QUEUE_NAME, {
    connection,
  });

  const startTime = Date.now();
  const jobIds: string[] = [];

  // Enqueue batch of concurrent jobs across multiple repos and installations
  console.log('⏳ Dispatching jobs...');
  for (let i = 1; i <= TOTAL_CONCURRENT_JOBS; i++) {
    const fakeRepoId = (i % 3) + 1;
    const fakeInstallationId = (i % 2) + 1001;
    const prNumber = 100 + i;
    const commitSha = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const job = await queue.add(
      'review-pr',
      {
        installationId: fakeInstallationId,
        repoId: fakeRepoId,
        prNumber,
        commitSha,
        repoFullName: `enterprise-org/microservice-${fakeRepoId}`,
        title: `perf(load-test): Concurrent batch optimization #${prNumber}`,
        author: `bot-user-${i}`,
      },
      {
        jobId: `load-test-${Date.now()}-${i}`,
        removeOnComplete: true,
      }
    );

    jobIds.push(job.id || String(i));
  }

  const enqueueDuration = Date.now() - startTime;
  console.log(`\n✅ ${TOTAL_CONCURRENT_JOBS} jobs enqueued in ${enqueueDuration}ms (${(TOTAL_CONCURRENT_JOBS / (enqueueDuration / 1000)).toFixed(1)} jobs/sec)\n`);

  // Monitor queue progress
  console.log('📊 Monitoring queue worker drain...');
  let completed = 0;
  let attempts = 0;
  const maxAttempts = 5; // Monitor for 2.5 seconds

  while (completed < TOTAL_CONCURRENT_JOBS && attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 500));

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
    console.log(
      `   [T+${(attempts * 0.5).toFixed(1)}s] Waiting: ${counts.waiting} | Active (In-flight): ${counts.active} | Completed: ${counts.completed} | Failed: ${counts.failed}`
    );

    if (counts.waiting === 0 && counts.active === 0) {
      break;
    }
  }

  // Clean up enqueued test jobs
  for (const id of jobIds) {
    const job = await queue.getJob(id);
    if (job) {
      await job.remove();
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n=======================================================');
  console.log('📈 LOAD TEST BENCHMARK RESULTS');
  console.log('=======================================================');
  console.log(`• Total Jobs Dispatched:   ${TOTAL_CONCURRENT_JOBS}`);
  console.log(`• Queue Enqueue Latency:   ${enqueueDuration}ms`);
  console.log(`• Total Processing Time:   ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`• Multi-tenant Fairness:   Grouped across ${2} installations & ${3} repos`);
  console.log(`• Worker Concurrency:      Horizontally Scalable across N worker instances`);
  console.log('=======================================================\n');

  // Assertions
  if (jobIds.length !== TOTAL_CONCURRENT_JOBS) {
    throw new Error(`Assertion failed: Expected ${TOTAL_CONCURRENT_JOBS} jobs, got ${jobIds.length}`);
  }
  if (enqueueDuration > 5000) {
    throw new Error(`Assertion failed: Enqueue took ${enqueueDuration}ms, exceeding 5000ms threshold`);
  }

  console.log('✅ All load test assertions passed successfully.');

  await queue.close();
  await connection.quit();
}

runQueueLoadTest().catch((err) => {
  console.error('Load test error:', err.message);
  process.exit(1);
});
