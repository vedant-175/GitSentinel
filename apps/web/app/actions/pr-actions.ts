'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-helpers';
import { syncUserPullRequests } from '@/lib/github-sync';

/**
 * Server action to synchronize pull requests for the current logged-in user
 * or any provided GitHub username directly from GitHub API.
 */
export async function syncUserPullRequestsAction(targetUsername?: string) {
  try {
    let username = targetUsername?.trim().replace(/^@/, '');
    if (!username) {
      const session = await requireSession().catch(() => null);
      username = session?.user?.login || (session?.user as any)?.name;
    }
    if (!username) {
      username = 'vedant-175'; // default active repository owner
    }

    const prs = await syncUserPullRequests(username);

    try {
      revalidatePath('/pull-requests');
      revalidatePath('/');
    } catch {
      // ignored outside Next request context
    }

    return {
      success: true,
      count: prs.length,
      prs,
      login: username,
      message: `Successfully synchronized ${prs.length} pull request${prs.length === 1 ? '' : 's'} from GitHub for @${username}!`,
    };
  } catch (error) {
    console.error('Failed to sync pull requests:', error);
    return {
      success: false,
      error: (error as Error).message || 'Failed to sync pull requests from GitHub',
    };
  }
}
