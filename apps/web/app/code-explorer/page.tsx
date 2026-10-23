import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepositories } from '@/lib/data';
import { CodeExplorerClient } from './CodeExplorerClient';

export const dynamic = 'force-dynamic';

export default async function CodeExplorerPage({
  searchParams,
}: {
  searchParams?: Promise<{ repo?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || '';

  let repositories: any[] = [];
  try {
    const res = await getRepositories({ limit: 50 });
    repositories = res?.data || [];
  } catch (err) {
    console.error('Failed to load repositories for code explorer:', err);
    repositories = [];
  }



  // Fallback repo options if completely empty
  const fallbackRepos = [
    { id: 1, fullName: 'facebook/react', defaultBranch: 'main', description: 'The library for web and native user interfaces' },
    { id: 2, fullName: 'vercel/next.js', defaultBranch: 'canary', description: 'The React Framework for the Web' },
    { id: 3, fullName: 'tailwindlabs/tailwindcss', defaultBranch: 'main', description: 'A utility-first CSS framework' },
  ];

  const finalRepos =
    repositories.length > 0
      ? repositories.map((r: any) => ({
          id: r.id,
          fullName: r.fullName || 'unknown/repository',
          defaultBranch: r.defaultBranch || 'main',
          description: r.description,
        }))
      : fallbackRepos;

  const initialRepo = resolvedSearchParams?.repo || finalRepos[0]?.fullName || 'facebook/react';

  return (
    <CodeExplorerClient
      repositories={finalRepos}
      initialRepoFullName={initialRepo}
    />
  );
}
