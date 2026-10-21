import { prisma } from '@ai-reviewer/db';

export interface GitHubAccountInfo {
  hasGithub: boolean;
  login?: string;
  avatarUrl?: string;
  id?: number;
  source?: 'github_search' | 'noreply_email' | 'database';
}

/**
 * Searches for a GitHub account associated with an email address.
 * Checks noreply formats, local user database, and GitHub Public Search API.
 */
export async function findGitHubAccountForEmail(email: string): Promise<GitHubAccountInfo> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { hasGithub: false };
  }

  // 1. Check if email is GitHub noreply format (e.g. username@users.noreply.github.com or 123456+username@users.noreply.github.com)
  const noreplyMatch = cleanEmail.match(/^(?:\d+\+)?([a-zA-Z0-9-]+)@users\.noreply\.github\.com$/i);
  if (noreplyMatch && noreplyMatch[1]) {
    const login = noreplyMatch[1];
    return {
      hasGithub: true,
      login,
      avatarUrl: `https://github.com/${login}.png`,
      source: 'noreply_email',
    };
  }

  // 2. Check local database for existing linked account
  try {
    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: cleanEmail, mode: 'insensitive' },
        githubLogin: { not: null },
      },
      select: { githubLogin: true, image: true, githubId: true },
    });
    if (existing?.githubLogin) {
      return {
        hasGithub: true,
        login: existing.githubLogin,
        avatarUrl: existing.image || `https://github.com/${existing.githubLogin}.png`,
        id: existing.githubId ? Number(existing.githubId) : undefined,
        source: 'database',
      };
    }
  } catch {
    // Database may be offline or table not present, continue
  }

  // 3. Query GitHub Search Users API
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'GitSentinel-App',
      Accept: 'application/vnd.github.v3+json',
    };
    const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(cleanEmail)}+in:email`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.total_count > 0 && data.items?.[0]) {
        const item = data.items[0];
        return {
          hasGithub: true,
          login: item.login,
          avatarUrl: item.avatar_url,
          id: item.id,
          source: 'github_search',
        };
      }
    }
  } catch (err) {
    console.warn('[findGitHubAccountForEmail] GitHub search lookup warning:', err);
  }

  return { hasGithub: false };
}
