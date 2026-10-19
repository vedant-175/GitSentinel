import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPullRequests } from '@/lib/data';
import { syncUserPullRequests } from '@/lib/github-sync';
import { CyberPRQueue } from './CyberPRQueue';

export const dynamic = 'force-dynamic';

export default async function PullRequestsPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || '';

  let dbPullRequests: any[] = [];
  try {
    const result = await getPullRequests({ limit: 50 });
    dbPullRequests = result?.data || [];
  } catch (e) {
    console.error('Failed to fetch pull requests:', e);
  }

  // If user is logged in and DB has 0 pull requests, auto-sync user's real PRs from GitHub
  if (currentUserLogin && dbPullRequests.length === 0) {
    try {
      await syncUserPullRequests(currentUserLogin);
      const refreshed = await getPullRequests({ limit: 50 }).catch(() => null);
      if (refreshed?.data && refreshed.data.length > 0) {
        dbPullRequests = refreshed.data;
      }
    } catch (syncErr) {
      console.warn('Failed to auto-sync pull requests for', currentUserLogin, syncErr);
    }
  }

  return <CyberPRQueue initialPullRequests={dbPullRequests} />;
}
