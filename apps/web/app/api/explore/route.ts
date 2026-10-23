import { NextRequest, NextResponse } from 'next/server';
import {
  checkPublicExploreRateLimit,
  acquireAIConcurrencySlot,
  releaseAIConcurrencySlot,
  getClientIp,
} from '../../../lib/rate-limit';
import { ExploreQuerySchema } from '../../../lib/ai-security';

export const dynamic = 'force-dynamic';

/**
 * Public Repository Exploration Endpoint (Non-Authenticated)
 *
 * Rules:
 * 1. Does NOT create an authenticated user session.
 * 2. Does NOT create or alter user records in the database.
 * 3. Does NOT grant private repository access or elevated permissions.
 * 4. Only queries public GitHub repositories via GitHub's public API.
 * 5. Rate-limited and validated against abuse.
 */
export async function GET(req: NextRequest) {
  // 1. Enforce per-IP public rate limiting (15 req/min)
  const rateLimitResponse = await checkPublicExploreRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = getClientIp(req);
  const slot = await acquireAIConcurrencySlot(ip, 2);
  if (!slot.acquired) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Too many concurrent exploration requests from this IP.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawUsername = searchParams.get('username') || searchParams.get('q') || '';
  const cleanUsername = rawUsername.trim().replace(/^@/, '');

  const queryValidation = ExploreQuerySchema.safeParse({ username: cleanUsername });
  if (!queryValidation.success) {
    await releaseAIConcurrencySlot(ip);
    return NextResponse.json(
      { error: queryValidation.error.errors[0]?.message || 'Invalid GitHub username format' },
      { status: 400 }
    );
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'GitSentinel-Public-Explorer/1.0',
      Accept: 'application/vnd.github.v3+json',
    };

    // Use server token if available to prevent unauthenticated IP rate limits on GitHub API
    const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (ghToken) {
      headers['Authorization'] = `token ${ghToken}`;
    }

    // 2. Fetch public user profile
    const userRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(cleanUsername)}`,
      { headers, signal: AbortSignal.timeout(8000) }
    );

    if (userRes.status === 404) {
      return NextResponse.json(
        { error: `GitHub user @${cleanUsername} was not found on GitHub.` },
        { status: 404 }
      );
    }

    if (userRes.status === 403 || userRes.status === 429) {
      return NextResponse.json(
        {
          error: 'GitHub API rate limit exceeded. Please try again shortly or sign in with GitHub for direct access.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      );
    }

    if (!userRes.ok) {
      return NextResponse.json(
        { error: `GitHub API error (${userRes.status}). Could not inspect user.` },
        { status: userRes.status }
      );
    }

    const userData = await userRes.json();

    // 3. Fetch public repositories
    const reposRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(cleanUsername)}/repos?per_page=100&sort=updated`,
      { headers, signal: AbortSignal.timeout(8000) }
    );

    let repos: any[] = [];
    if (reposRes.ok) {
      const rawRepos = await reposRes.json();
      if (Array.isArray(rawRepos)) {
        repos = rawRepos
          .filter((r) => !r.private) // strictly public repositories only
          .map((r) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description || 'Public GitHub repository.',
            defaultBranch: r.default_branch || 'main',
            stars: r.stargazers_count ?? 0,
            forks: r.forks_count ?? 0,
            language: r.language || 'Code',
            htmlUrl: r.html_url,
            updatedAt: r.updated_at,
            isPrivate: false,
            openIssuesCount: r.open_issues_count ?? 0,
          }));
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
        bio: userData.bio || '',
        publicRepos: userData.public_repos ?? repos.length,
        htmlUrl: userData.html_url,
      },
      reposCount: repos.length,
      repos,
      notice: 'Public exploration preview. To run AI code reviews, automated security scanning, or connect private repositories, please sign in with GitHub.',
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 23) {
      return NextResponse.json(
        { error: 'GitHub API request timed out. Please check your internet connection and try again.' },
        { status: 504 }
      );
    }

    console.error('[Public Explore] Error inspecting user:', err);
    return NextResponse.json(
      { error: 'Failed to explore repositories due to an unexpected error.' },
      { status: 500 }
    );
  } finally {
    await releaseAIConcurrencySlot(ip);
  }
}
