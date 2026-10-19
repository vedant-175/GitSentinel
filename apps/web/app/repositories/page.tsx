import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepositories } from '@/lib/data';
import { RepositoriesView } from './RepositoriesView';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || 'Santlaj';

  let repositories: any[] = [];
  try {
    const res = await getRepositories({ limit: 100 });
    repositories = res?.data || [];
  } catch (err) {
    console.error('Failed to load repositories:', err);
    repositories = [];
  }

  return (
    <RepositoriesView
      initialRepositories={repositories}
      currentUserLogin={currentUserLogin}
    />
  );
}
