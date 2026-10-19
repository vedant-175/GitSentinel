import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepositories } from '@/lib/data';
import { RepositoriesView } from './RepositoriesView';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || '';

  let repositories: any[] = [];
  try {
    const res = await getRepositories({ limit: 100 });
    repositories = res?.data || [];
  } catch (err) {
    console.error('Failed to load repositories from database:', err);
    repositories = [];
  }

  // If a user is logged in and DB has 0 records (e.g. serverless runtime), fetch their live GitHub repositories directly
  if (currentUserLogin && repositories.length === 0) {
    try {
      const ghRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(currentUserLogin)}/repos?per_page=100&sort=updated`,
        {
          headers: {
            'User-Agent': 'GitSentinel-Surveillance/1.0',
            Accept: 'application/vnd.github.v3+json',
          },
          next: { revalidate: 60 },
        }
      );
      if (ghRes.ok) {
        const data = await ghRes.json();
        if (Array.isArray(data)) {
          repositories = data.map((r: any) => ({
            id: r.id,
            fullName: r.full_name,
            description: r.description || 'Public repository synchronized from GitHub.',
            status: 'Active',
            defaultBranch: r.default_branch || 'main',
            prsCount: Math.min(r.open_issues_count || 0, 10),
            findings: { high: 0, medium: 0, low: 0 },
            updatedAt: r.updated_at,
          }));
        }
      }
    } catch (fetchErr) {
      console.warn('[RepositoriesPage] Failed to fetch live repositories from GitHub API:', fetchErr);
    }
  }

  return (
    <RepositoriesView
      initialRepositories={repositories}
      currentUserLogin={currentUserLogin}
    />
  );
}
