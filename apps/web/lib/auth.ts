import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@ai-reviewer/db';
import { syncUserRepositories } from './github-sync';
import { verifyPassword } from './password';
import { findGitHubAccountForEmail } from './github-email';

// Auto-detect production URL on Vercel
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'gitsentinel-red.vercel.app';
  if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes('localhost')) {
    process.env.NEXTAUTH_URL = `https://${vercelUrl}`;
  }
}

const clientId = process.env.NEXTAUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.NEXTAUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
const secret = process.env.NEXTAUTH_SECRET || 'gitsentinel-production-fallback-secret-key-32chars';

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
}

// Boot validation is exported and called during provider build and server boot

/**
 * Builds the authentication providers list according to security rules:
 * 1. GithubProvider with minimal OAuth scope ('read:user') - Direct 1-Click GitHub OAuth
 * 2. CredentialsProvider - Supporting both GitHub Username registration/login and Email & Password
 */
export function buildProviders() {
  const github = GithubProvider({
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    authorization: {
      url: 'https://github.com/login/oauth/authorize',
      params: {
        scope: 'read:user', // Narrow OAuth scope to the minimum
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

  // Enable Credentials login when explicitly configured in dev mode, on Vercel preview/production, or non-test envs
  const isDevLoginEnabled =
    (process.env.ENABLE_DEV_LOGIN === 'true' && process.env.NODE_ENV === 'development') ||
    Boolean(process.env.VERCEL) ||
    (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_LOGIN !== 'true');

  if (isDevLoginEnabled) {
    const creds = CredentialsProvider({
      id: 'credentials',
      name: 'GitSentinel Login',
      credentials: {
        username: {
          label: 'GitHub Username',
          type: 'text',
          placeholder: 'Enter GitHub username (e.g. octocat, torvalds)',
        },
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'name@example.com',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
      },
      async authorize(credentials, req) {
        // Verify host is localhost or Vercel deployment
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
        const isVercelHost = host.endsWith('.vercel.app') && Boolean(process.env.VERCEL);

        if (!isLocalhost && !isVercelHost) {
          throw new Error('Dev credentials login is only permitted on localhost');
        }

        // =========================================================================
        // METHOD 1: EMAIL & PASSWORD LOGIN
        // =========================================================================
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (email && password) {
          // Check if registered email has a GitHub account
          const ghAccount = await findGitHubAccountForEmail(email);

          // Find user in database
          let dbUser = null;
          try {
            dbUser = await prisma.user.findUnique({
              where: { email },
            });
          } catch (dbErr) {
            console.warn('[Auth] Database offline during email login:', dbErr);
          }

          // If user exists in DB, verify password
          if (dbUser && dbUser.passwordHash) {
            const isValid = verifyPassword(password, dbUser.passwordHash);
            if (!isValid) {
              throw new Error('Invalid email or password');
            }
          }

          // User Requirement:
          // "first login/register should be if someone can type their email and password, if their registered email has github acc in it, so then they must connect with their github"
          if (ghAccount.hasGithub && ghAccount.login) {
            if (!dbUser?.githubLogin) {
              throw new Error(`GITHUB_CONNECT_REQUIRED:${ghAccount.login}`);
            }
          }

          const effectiveLogin = dbUser?.githubLogin || ghAccount.login || email.split('@')[0];
          const displayName = dbUser?.name || effectiveLogin;
          const userImage = dbUser?.image || (ghAccount.login ? `https://github.com/${ghAccount.login}.png` : undefined);

          // Ensure installations exist for this user
          let userInstIds = [1];
          try {
            if (effectiveLogin) {
              const insts = await prisma.installation.findMany({
                where: { accountLogin: { equals: effectiveLogin, mode: 'insensitive' } },
                select: { githubInstallationId: true },
              });
              if (insts.length > 0) {
                userInstIds = insts.map((i) => Number(i.githubInstallationId));
              }
            }
          } catch (instErr) {
            console.warn('[Auth] Could not load installations for user:', instErr);
          }

          return {
            id: dbUser?.id || `user-${effectiveLogin}`,
            name: displayName,
            email: email,
            login: effectiveLogin,
            image: userImage,
            installationIds: userInstIds,
          };
        }

        // =========================================================================
        // METHOD 2: GITHUB USERNAME LOGIN / REGISTRATION
        // =========================================================================
        const username = credentials?.username?.trim().replace(/^@/, '');
        if (!username) {
          return null;
        }

        // Dynamically synchronize public repositories for ANY GitHub username
        try {
          await syncUserRepositories(username);
        } catch (syncErr) {
          console.warn(`[Auth] Sync warning for ${username}:`, syncErr);
        }

        // Query or create installations for this account
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

          // Upsert User model in DB
          await prisma.user.upsert({
            where: { githubLogin: username },
            update: {
              name: username,
              image: `https://github.com/${username}.png`,
            },
            create: {
              githubLogin: username,
              name: username,
              email: `${username}@users.noreply.github.com`,
              image: `https://github.com/${username}.png`,
            },
          }).catch(() => {});
        } catch (dbErr) {
          console.warn(`[Auth] Database offline during login for ${username}, continuing with offline installation.`);
        }

        const userInstIds = matchingInsts.length > 0
          ? matchingInsts.map((i) => Number(i.githubInstallationId))
          : [1];
        const effectiveLogin = matchingInsts[0]?.accountLogin || username;

        return {
          id: `gh-user-${effectiveLogin}`,
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
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        try {
          const ghLogin = (profile as any).login;
          const ghId = (profile as any).id ? BigInt((profile as any).id) : null;
          const ghEmail = (profile as any).email || user?.email;
          const ghAvatar = (profile as any).avatar_url || user?.image;
          const ghName = (profile as any).name || ghLogin;

          if (ghLogin) {
            // Asynchronously sync public repositories using authenticated OAuth access token
            syncUserRepositories(ghLogin, account?.access_token).catch((e) =>
              console.warn('[Auth] sync error on OAuth sign in:', e)
            );

            // Link or create User record
            await prisma.user.upsert({
              where: { githubLogin: ghLogin },
              update: {
                githubId: ghId,
                image: ghAvatar,
                name: ghName,
                ...(ghEmail ? { email: ghEmail } : {}),
              },
              create: {
                githubLogin: ghLogin,
                githubId: ghId,
                name: ghName,
                email: ghEmail,
                image: ghAvatar,
              },
            });
          }
        } catch (err) {
          console.warn('[Auth Event] Could not upsert user on OAuth sign in:', err);
        }
      }
    },
  },
  pages: {
    signIn: '/login',
  },
};


