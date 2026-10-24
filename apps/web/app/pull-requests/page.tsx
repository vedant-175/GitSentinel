import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getServerOAuthToken } from '@/lib/auth-helpers';
import { syncUserPullRequests } from '@/lib/github-sync';
import { getPullRequests } from '@/lib/data';
import { CyberPRQueue } from './CyberPRQueue';

export const dynamic = 'force-dynamic';

export default async function PullRequestsPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin =
    session?.user?.login || (session?.user as any)?.name || 'vedant-175';

  // Automatically sync latest PRs from GitHub on page load
  if (currentUserLogin) {
    try {
      const token = await getServerOAuthToken().catch(() => undefined);
      await syncUserPullRequests(currentUserLogin, token);
    } catch (syncErr) {
      console.warn('Auto PR sync on page load failed:', syncErr);
    }
  }

  let dbPullRequests: any[] = [];
  try {
    const result = await getPullRequests({ limit: 50 });
    dbPullRequests = result?.data || [];
  } catch (e) {
    console.error('Failed to fetch pull requests:', e);
  }



  // Sort descending so the most recent PRs appear at the top
  dbPullRequests.sort((a: any, b: any) => {
    const timeA = a.openedAt ? new Date(a.openedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.openedAt ? new Date(b.openedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
    const numA = Number(a.githubPrNumber || a.number || a.id) || 0;
    const numB = Number(b.githubPrNumber || b.number || b.id) || 0;
    if (numA !== numB) return numB - numA;
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <CyberPRQueue
      initialPullRequests={dbPullRequests}
      currentUserLogin={currentUserLogin}
    />
  );
}
