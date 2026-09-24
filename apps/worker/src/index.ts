import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ReviewJobData } from '@ai-reviewer/shared';
import { processReviewJob } from './review/pipeline.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = 'pr-review-queue';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

console.log('🚀 Initializing AI Code Review Worker...');
console.log(`📡 Connecting to Redis: ${REDIS_URL}`);
console.log(`⚡ Concurrency: ${CONCURRENCY} jobs`);

const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  console.log('✅ Connected to Redis successfully.');
});

redisConnection.on('error', (err: Error) => {
  console.error('❌ Redis Connection Error:', err.message);
});

export const worker = new Worker<ReviewJobData>(
  QUEUE_NAME,
  async (job: Job<ReviewJobData>) => {
    console.log(`\n📥 Received Job [ID: ${job.id}] for PR #${job.data.prNumber} (${job.data.repoFullName || 'repoId:' + job.data.repoId})`);
    
    const result = await processReviewJob(job.data);
    return result;
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    limiter: {
      max: 20,
      duration: 60000, // 20 reviews per minute max across the worker to stay well within API limits
    },
  }
);

worker.on('completed', (job: Job<ReviewJobData>, returnvalue: unknown) => {
  console.log(`🎉 Job [ID: ${job.id}] completed successfully:`, returnvalue);
});

worker.on('failed', (job: Job<ReviewJobData> | undefined, err: Error) => {
  console.error(`💥 Job [ID: ${job?.id}] failed after attempt ${job?.attemptsMade}:`, err.message);
});

// Graceful shutdown
async function handleShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Closing worker gracefully...`);
  await worker.close();
  await redisConnection.quit();
  console.log('👋 Worker closed.');
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
