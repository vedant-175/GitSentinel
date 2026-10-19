import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting clean database seed (zero demo data, real repositories only)...');

  // 1. Clean existing data completely
  await prisma.reviewIssue.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.pullRequest.deleteMany({});
  await prisma.failedReview.deleteMany({});
  await prisma.repository.deleteMany({});
  await prisma.installation.deleteMany({});

  // 2. Create Real User Installation for vedant-175
  const userInstallation = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(132144344),
      accountLogin: 'vedant-175',
      accountType: 'User',
    },
  });

  // 3. Create Real GitHub Repositories for vedant-175
  const realRepositories = [
    {
      githubRepoId: BigInt(1226227434),
      fullName: 'vedant-175/AI-resume-builder',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(1007727485),
      fullName: 'vedant-175/Codsoft',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(1196451510),
      fullName: 'vedant-175/ddas',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(1083485648),
      fullName: 'vedant-175/hacktoberfest2025',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(890866045),
      fullName: 'vedant-175/K24GP',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(875781395),
      fullName: 'vedant-175/My-Portfolio-',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(875476824),
      fullName: 'vedant-175/Python-Programs',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(1292425990),
      fullName: 'vedant-175/Smart-Internship-portal',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(1158953557),
      fullName: 'vedant-175/Webathon_final_submission',
      defaultBranch: 'main',
    },
    {
      githubRepoId: BigInt(879247247),
      fullName: 'vedant-175/website',
      defaultBranch: 'main',
    },
  ];

  for (const repo of realRepositories) {
    await prisma.repository.create({
      data: {
        installationId: userInstallation.id,
        githubRepoId: repo.githubRepoId,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        config: {
          ignored_globs: ['*.lock', 'dist/**', 'coverage/**'],
          severity_threshold: 'suggestion',
          disabled_categories: [],
          max_comments_per_pr: 25,
        },
      },
    });
  }

  // 4. Zero Demo PRs, Zero Demo Reviews, Zero Demo Issues
  // Clean empty state ready for real GitHub pull requests and webhook ingestion.

  console.log(`✅ Database initialized with clean state: 1 real installation (${userInstallation.accountLogin}), ${realRepositories.length} real repositories, 0 demo PRs, 0 demo reviews.`);
}

main()
  .catch((e) => {
    console.error('❌ Error during clean seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
