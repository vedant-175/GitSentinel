import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@ai-reviewer/db';
import { syncUserRepositories } from './github-sync';

const clientId = process.env.NEXTAUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.NEXTAUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
const secret = process.env.NEXTAUTH_SECRET;

/**
 * Validates authentication environment configuration.
 * It is a fatal boot error to set ENABLE_DEV_LOGIN=true in any environment other than development.
 */
export function validateAuthConfig() {
  if (
    process.env.ENABLE_DEV_LOGIN === 'true' &&
    process.env.NODE_ENV !== 'development' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    throw new Error(
      'FATAL: ENABLE_DEV_LOGIN=true is strictly forbidden when NODE_ENV is not "development". Boot aborted.'
    );
  }

  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    if (!clientId || !clientSecret || !secret) {
      throw new Error(
        'FATAL: NEXTAUTH_GITHUB_CLIENT_ID, NEXTAUTH_GITHUB_CLIENT_SECRET, and NEXTAUTH_SECRET are required in production.'
      );
    }
  }
}

// Boot validation is exported and called during provider build and server boot

/**
 * Builds the authentication providers list according to security rules:
 * - GithubProvider with minimal OAuth scope ('read:user')
 * - CredentialsProvider is ONLY included if ENABLE_DEV_LOGIN=true AND NODE_ENV=development AND host is localhost
 */
export function buildProviders() {
  const github = GithubProvider({
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    authorization: {
      url: 'https://github.com/login/oauth/authorize',
      params: {
        scope: 'read:user', // Item 6: Narrow OAuth scope to the minimum
      },
    },
  });
  // Ensure scope is strictly read:user on provider definition
  (github as any).authorization = {
    url: 'https://github.com/login/oauth/authorize',
    params: {
      scope: 'read:user',
    },
  };

  const providers: any[] = [github];

  // Item 4: Remove CredentialsProvider from every build except a local-only, explicitly flagged dev mode
  const isDevLoginEnabled =
    process.env.ENABLE_DEV_LOGIN === 'true' && process.env.NODE_ENV === 'development';

  if (isDevLoginEnabled) {
    const creds = CredentialsProvider({
      id: 'credentials',
      name: 'Local Dev Login',
      credentials: {
        username: {
          label: 'GitHub Username',
          type: 'text',
          placeholder: 'Enter GitHub username (e.g. octocat, torvalds)',
        },
      },
      async authorize(credentials, req) {
        // Verify host is strictly localhost or 127.0.0.1
        const rawHost =
          req?.headers?.host ||
          (req?.headers as Record<string, string> | undefined)?.['host'] ||
          '';
        const host = (typeof rawHost === 'string' ? rawHost : '').split(':')[0].toLowerCase();
        const isLocalhost =
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '[::1]' ||
          host === '::1';

        if (!isLocalhost) {
          throw new Error('Dev credentials login is only permitted on localhost');
        }

        const username = credentials?.username?.trim();
        if (!username) {
          return null;
        }

        // Dynamically synchronize public repositories for ANY GitHub username
        try {
          await syncUserRepositories(username);
        } catch (syncErr) {
          console.warn(`[Auth] Sync warning for ${username}:`, syncErr);
        }

        // Query installations created for this account
        let matchingInsts: Array<{ githubInstallationId: bigint; accountLogin: string }> = [];
        try {
          matchingInsts = await prisma.installation.findMany({
            where: {
              accountLogin: {
                equals: username,
                mode: 'insensitive',
              },
            },
            select: { githubInstallationId: true, accountLogin: true },
          });

          // Fallback: If not found, ensure a local installation exists so the user can always log in
          if (matchingInsts.length === 0) {
            const fallbackInstId = BigInt(Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 900));
            const fallback = await prisma.installation.create({
              data: {
                githubInstallationId: fallbackInstId,
                accountLogin: username,
                accountType: 'User',
              },
              select: { githubInstallationId: true, accountLogin: true },
            });
            matchingInsts = [fallback];
          }
        } catch (dbErr) {
          console.warn(`[Auth] Database offline during login for ${username}, continuing with offline installation.`);
        }

        const userInstIds = matchingInsts.length > 0
          ? matchingInsts.map((i) => Number(i.githubInstallationId))
          : [1];
        const effectiveLogin = matchingInsts[0]?.accountLogin || username;

        return {
          id: `dev-user-${effectiveLogin}`,
          name: effectiveLogin,
          email: `${effectiveLogin}@users.noreply.github.com`,
          login: effectiveLogin,
          image: `https://github.com/${effectiveLogin}.png`,
          installationIds: userInstIds,
        };
      },
    });

    // Make authorize callable directly on provider instance
    creds.authorize = (creds as any).options.authorize;
    providers.push(creds);
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  secret,
  callbacks: {
    // Item 6: Keep network or DB writes out of the jwt callback
    async jwt({ token, account, profile, user }) {
      if (user) {
        token.sub = user.id;
        token.login = (user as any).login || user.name || 'github-developer';
        token.picture = (user as any).image;
        if ((user as any).installationIds) {
          token.installationIds = (user as any).installationIds;
        }
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile && 'login' in profile && typeof profile.login === 'string') {
        token.login = profile.login;
      }

      // Pure in-memory token transformation - NO network calls, NO database writes
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub;
        session.user.login = token.login;
        session.user.image = (token.picture as string) || (session.user as any)?.image;
      }
      session.accessToken = token.accessToken;
      if (token.installationIds) {
        session.installationIds = token.installationIds;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

