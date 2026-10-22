import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@ai-reviewer/db';
import { syncUserRepositories } from '@/lib/github-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: 'You must be signed in with your email to connect a GitHub account.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawLogin = typeof body.githubLogin === 'string' ? body.githubLogin : '';
    const cleanLogin = rawLogin.trim().replace(/^@/, '');

    if (!cleanLogin) {
      return NextResponse.json(
        { error: 'Please provide a valid GitHub username to connect.' },
        { status: 400 }
      );
    }

    // Verify user on GitHub API
    const headers: Record<string, string> = {
      'User-Agent': 'GitSentinel-App',
      Accept: 'application/vnd.github.v3+json',
    };
    const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    let verifiedLogin = cleanLogin;
    let avatarUrl = `https://github.com/${cleanLogin}.png`;
    let ghId: bigint | null = null;

    try {
      const ghRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(cleanLogin)}`,
        { headers, signal: AbortSignal.timeout(6000) }
      );

      if (!ghRes.ok) {
        if (ghRes.status === 404) {
          return NextResponse.json(
            { error: `GitHub user @${cleanLogin} was not found on GitHub.` },
            { status: 404 }
          );
        }
        console.warn(`[Connect GitHub] GitHub API responded with status ${ghRes.status}`);
      } else {
        const ghData = await ghRes.json();
        verifiedLogin = ghData.login || cleanLogin;
        avatarUrl = ghData.avatar_url || avatarUrl;
        if (ghData.id) {
          ghId = BigInt(ghData.id);
        }
      }
    } catch (apiErr) {
      console.warn('[Connect GitHub] Could not verify with GitHub API directly, proceeding:', apiErr);
    }

    // Update User record in database
    try {
      await prisma.user.update({
        where: { email: session.user.email },
        data: {
          githubLogin: verifiedLogin,
          ...(ghId ? { githubId: ghId } : {}),
          image: avatarUrl,
        },
      });
    } catch (dbErr) {
      console.warn('[Connect GitHub] Database update warning:', dbErr);
    }

    // Ensure installation exists and sync public repositories immediately
    let syncedReposCount = 0;
    try {
      const syncResult = await syncUserRepositories(verifiedLogin, session.accessToken);
      syncedReposCount = syncResult.repos?.length || 0;
    } catch (syncErr) {
      console.warn(`[Connect GitHub] Failed auto-sync for ${verifiedLogin}:`, syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully connected GitHub account @${verifiedLogin}!`,
      githubLogin: verifiedLogin,
      avatarUrl,
      reposCount: syncedReposCount,
    });
  } catch (error: any) {
    console.error('Error connecting GitHub account:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred while connecting GitHub.' },
      { status: 500 }
    );
  }
}
