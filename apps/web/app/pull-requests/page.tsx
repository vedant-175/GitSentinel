import { getSessionInstallationIds } from '@/lib/auth-helpers';
import { getPullRequests } from '@/lib/data';
import { CyberPRQueue } from './CyberPRQueue';

export const dynamic = 'force-dynamic';

export default async function PullRequestsPage() {
  let installationIds: bigint[] = [];
  try {
    installationIds = await getSessionInstallationIds();
  } catch {
    // Unauthenticated
  }

  let dbPullRequests: any[] = [];
  if (installationIds.length > 0) {
    try {
      const result = await getPullRequests({ limit: 25 });
      dbPullRequests = result.data;
    } catch (e) {
      console.error('Failed to fetch pull requests:', e);
    }
  }

  return <CyberPRQueue initialPullRequests={dbPullRequests} />;
}

