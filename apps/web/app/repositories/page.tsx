import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepositories } from '@/lib/data';
import { syncUserRepositories } from '@/lib/github-sync';
import { RepositoriesView } from './RepositoriesView';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ explore?: string; username?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const exploreTarget = resolvedParams.explore || resolvedParams.username;
  if (exploreTarget) {
    redirect(`/explore?username=${encodeURIComponent(exploreTarget)}`);
  }

  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || '';

  let repositories: any[] = [];
  try {
    const res = await getRepositories({ limit: 500 });
    repositories = res?.data || [];
  } catch (err) {
    console.error('Failed to load repositories from database:', err);
    repositories = [];
  }

  // If a user is logged in and DB has 0 records, synchronize or fetch live GitHub repositories
  if (currentUserLogin && repositories.length === 0) {
    try {
      const syncResult = await syncUserRepositories(currentUserLogin, session?.accessToken);
      if (syncResult.success) {
        const refreshed = await getRepositories({ limit: 500 }).catch(() => null);
        if (refreshed?.data && refreshed.data.length > 0) {
          repositories = refreshed.data;
        } else if (syncResult.repos && syncResult.repos.length > 0) {
          repositories = syncResult.repos;
        } else {
          repositories = [];
        }
      }
    } catch (syncErr) {
      console.warn('[RepositoriesPage] Failed to sync user repositories:', syncErr);
    }
  }

  return (
    <RepositoriesView
      initialRepositories={repositories}
      currentUserLogin={currentUserLogin}
    />
  );
}
