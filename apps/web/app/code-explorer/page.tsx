import { getRepositories } from '@/lib/data';
import { CodeExplorerClient } from './CodeExplorerClient';

export const dynamic = 'force-dynamic';

export default async function CodeExplorerPage({
  searchParams,
}: {
  searchParams?: { repo?: string };
}) {
  let repositories: any[] = [];
  try {
    const res = await getRepositories({ limit: 50 });
    repositories = res?.data || [];
  } catch (err) {
    console.error('Failed to load repositories for code explorer:', err);
    repositories = [];
  }

  // Fallback repo list if DB is empty
  const fallbackRepos = [
    { id: 1, fullName: 'Santlaj/RockPaperScissor.py', defaultBranch: 'main' },
    { id: 2, fullName: 'Santlaj/hackathon', defaultBranch: 'main' },
    { id: 3, fullName: 'Santlaj/Chatbot', defaultBranch: 'main' },
    { id: 4, fullName: 'Santlaj/Webathon_final_submission', defaultBranch: 'main' },
    { id: 5, fullName: 'Santlaj/DSA_Leetcode', defaultBranch: 'main' },
    { id: 6, fullName: 'Santlaj/santlaj.github.io', defaultBranch: 'main' },
    { id: 7, fullName: 'Santlaj/Smart-Internship-Portal', defaultBranch: 'main' },
    { id: 8, fullName: 'Santlaj/infra-setup', defaultBranch: 'main' },
  ];

  // Ensure vedant-175/website is present and prioritized
  const defaultWebsiteRepo = {
    id: 100,
    fullName: 'vedant-175/website',
    defaultBranch: 'main',
    description: 'Production website repository with Winston security telemetry logging',
  };

  const finalRepos =
    repositories.length > 0
      ? repositories.map((r: any) => ({
          id: r.id,
          fullName: r.fullName || 'unknown/repository',
          defaultBranch: r.defaultBranch || 'main',
          description: r.description,
        }))
      : fallbackRepos;

  // Prioritize vedant-175/website
  const hasVedant = finalRepos.some((r: any) => r.fullName === 'vedant-175/website');
  const sortedRepos = hasVedant
    ? [
        finalRepos.find((r: any) => r.fullName === 'vedant-175/website')!,
        ...finalRepos.filter((r: any) => r.fullName !== 'vedant-175/website'),
      ]
    : [defaultWebsiteRepo, ...finalRepos];

  return (
    <CodeExplorerClient
      repositories={sortedRepos}
      initialRepoFullName={searchParams?.repo || 'vedant-175/website'}
    />
  );
}
