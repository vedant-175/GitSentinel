import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepositories } from '@/lib/data';
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



  return (
    <RepositoriesView
      initialRepositories={repositories}
      currentUserLogin={currentUserLogin}
    />
  );
}
