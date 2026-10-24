import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { prisma } from '@ai-reviewer/db';
import { syncUserRepositories } from './github-sync';

// Auto-detect production URL on Vercel only if NEXTAUTH_URL is not set in environment
if (!process.env.NEXTAUTH_URL) {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    process.env.NEXTAUTH_URL = `https://${vercelUrl}`;
  }
}

/**
 * Safely resolves NEXTAUTH_SECRET without any hardcoded production secrets.
 * - In production: strictly requires NEXTAUTH_SECRET with at least 32 characters, failing closed if missing.
 * - In development / testing: allows explicit configuration from .env or development fallback.
 * - Never logs secrets.
 * - Does not generate random ephemeral secrets on startup.
 */
export function getAuthSecret(): string {
  const envSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (!envSecret || envSecret.trim().length < 32) {
    if (isProduction && !isBuildPhase) {
      throw new Error(
        'FATAL: NEXTAUTH_SECRET environment variable is missing or less than 32 characters in production. Boot aborted.'
      );
    }
    if (envSecret && envSecret.trim().length > 0) {
      return envSecret.trim();
    }
    // Only in non-production environments when secret is unset:
    return 'development-only-local-secret-do-not-use-in-production-32-chars';
  }

  return envSecret.trim();
}

/**
 * Validates authentication environment configuration.
 * Fails safely when required production configuration or secrets are missing.
 */
export function validateAuthConfig() {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (
    process.env.ENABLE_DEV_LOGIN === 'true' &&
    process.env.NODE_ENV !== 'development' &&
    !isBuildPhase
  ) {
    throw new Error(
      'FATAL: ENABLE_DEV_LOGIN=true is strictly forbidden when NODE_ENV is not "development". Boot aborted.'
    );
  }

  // Ensure production secret is present and meets minimum entropy requirement (>= 32 chars)
  const envSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (isProduction && !isBuildPhase && (!envSecret || envSecret.trim().length < 32)) {
    throw new Error(
      'FATAL: NEXTAUTH_SECRET is required in production and must be at least 32 characters long. Boot aborted.'
    );
  }
}

/**
 * Builds the authentication providers list according to security rules:
 * 1. GithubProvider with minimal OAuth scope ('read:user') and cryptographic state validation.
 * Credentials-based and username-based authentication are retired in favor of GitHub-First OAuth.
 */
export function buildProviders() {
  const clientId = process.env.NEXTAUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.NEXTAUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

  const oauthScope = process.env.GITHUB_OAUTH_SCOPE || 'read:user';
  const github = GithubProvider({
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    checks: ['state'],
    authorization: {
      url: 'https://github.com/login/oauth/authorize',
      params: {
        scope: oauthScope, // Narrow OAuth scope or user-configured repo scope
      },
    },
  });
  // Ensure checks and scope are set directly on the provider definition
  (github as any).checks = ['state'];
  (github as any).authorization = {
    url: 'https://github.com/login/oauth/authorize',
    params: {
      scope: oauthScope,
    },
  };

  return [github];
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  get secret() {
    return getAuthSecret();
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
      },
    },
  },
  callbacks: {
    // Keep network or DB writes out of normal sign in jwt callback
    async jwt({ token, account, profile, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        token.login = (user as any).login || user.name || 'github-developer';
        token.picture = (user as any).image;
        token.email = user.email || token.email;
        token.authMethod = (user as any).authMethod || (account?.provider === 'github' ? 'oauth' : 'username');
        token.isGithubConnected = (user as any).isGithubConnected !== undefined
          ? (user as any).isGithubConnected
          : (account?.provider === 'github' || token.authMethod === 'username');
        token.detectedGithubLogin = (user as any).detectedGithubLogin || null;
        token.githubLogin = (user as any).githubLogin || null;
        if ((user as any).installationIds) {
          token.installationIds = (user as any).installationIds;
        }
      }
      if (account?.provider === 'github') {
        token.authMethod = 'oauth';
        token.isGithubConnected = true;
      }
      // Store provider access token ONLY on server-side encrypted JWT
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile && 'login' in profile && typeof profile.login === 'string') {
        token.login = profile.login;
        token.githubLogin = profile.login;
        token.isGithubConnected = true;
      }
      if (profile && 'id' in profile && profile.id) {
        token.githubId = String(profile.id);
      }

      if (!token.installationIds && token.login) {
        try {
          const inst = await prisma.installation.findFirst({
            where: {
              accountLogin: { equals: token.login as string, mode: 'insensitive' },
              accountType: 'User',
            },
            select: { githubInstallationId: true },
          });
          if (inst) {
            token.installationIds = [Number(inst.githubInstallationId)];
          }
        } catch {
          // ignore if DB is offline
        }
      }

      // Step 4: Harden client-triggered session updates against spoofing.
      // Never trust client-supplied GitHub identity, account-linking status, installation IDs, or permissions.
      if (trigger === 'update') {
        // Allow ONLY benign cosmetic display name from client
        if (session?.user?.name && typeof session.user.name === 'string') {
          token.name = session.user.name.slice(0, 100);
        }

        // Re-verify authoritative identity and account-linking status from server database
        if (token.sub) {
          try {
            const verifiedUser = await prisma.user.findUnique({
              where: { id: token.sub },
              select: {
                name: true,
                image: true,
                githubLogin: true,
                githubId: true,
              },
            });
            if (verifiedUser) {
              if (verifiedUser.githubLogin) {
                token.githubLogin = verifiedUser.githubLogin;
                token.login = verifiedUser.githubLogin;
                token.isGithubConnected = true;
              }
              if (verifiedUser.githubId) {
                token.githubId = String(verifiedUser.githubId);
              }
              if (verifiedUser.name) token.name = verifiedUser.name;
              if (verifiedUser.image) token.picture = verifiedUser.image;
            }
          } catch {
            // Database temporarily offline - maintain existing verified token state
          }
        }
      }

      // Pure in-memory token transformation - NO untrusted writes
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub;
        session.user.login = token.login;
        session.user.image = (token.picture as string) || (session.user as any)?.image;
        session.user.authMethod = token.authMethod || 'oauth';
        session.user.isGithubConnected = token.isGithubConnected !== false;
        session.user.detectedGithubLogin = token.detectedGithubLogin;
        session.user.githubLogin = token.githubLogin || token.login;
        (session.user as any).githubId = (token as any).githubId || null;
      }

      // Step 3: Do NOT return GitHub access token in browser-visible session!
      // session.accessToken is intentionally NOT populated here.
      delete (session as any).accessToken;

      if (token.installationIds) {
        session.installationIds = token.installationIds;
      }

      // If email-authenticated user is marked not connected in token, check if DB now has githubLogin
      if (session?.user?.email && session.user.authMethod === 'email' && !session.user.isGithubConnected) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { githubLogin: true, image: true },
          });
          if (dbUser?.githubLogin) {
            session.user.isGithubConnected = true;
            session.user.githubLogin = dbUser.githubLogin;
            session.user.login = dbUser.githubLogin;
            if (dbUser.image) {
              session.user.image = dbUser.image;
            }
          }
        } catch {
          // Ignore if db offline
        }
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        try {
          const ghLogin = (profile as any).login;
          const rawId = (profile as any).id;
          const ghId = rawId ? BigInt(rawId) : null;
          const ghEmail = (profile as any).email || user?.email;
          const ghAvatar = (profile as any).avatar_url || user?.image;
          const ghName = (profile as any).name || ghLogin;

          if (ghLogin) {
            // Asynchronously sync public repositories using authenticated OAuth access token
            syncUserRepositories(ghLogin, account?.access_token).catch((e) =>
              console.warn('[Auth] sync error on OAuth sign in:', e)
            );

            // Step 1: Look up by stable numeric GitHub ID (provider identity)
            const existingUser = ghId
              ? await prisma.user.findUnique({
                  where: { githubId: ghId },
                }).catch(() => null)
              : null;

            if (existingUser) {
              // Update mutable fields (username rename, avatar, name)
              await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                  githubLogin: ghLogin,
                  image: ghAvatar || existingUser.image,
                  name: ghName || existingUser.name,
                },
              }).catch((e) => console.warn('[Auth] Failed to update user by githubId:', e));
            } else {
              // Step 2: Check if there's an existing record with matching githubLogin (legacy record without githubId)
              const existingByLogin = await prisma.user.findUnique({
                where: { githubLogin: ghLogin },
              }).catch(() => null);

              if (existingByLogin && !existingByLogin.githubId) {
                // Link the stable numeric ID safely
                await prisma.user.update({
                  where: { id: existingByLogin.id },
                  data: {
                    githubId: ghId,
                    name: ghName || existingByLogin.name,
                    image: ghAvatar || existingByLogin.image,
                  },
                }).catch((e) => console.warn('[Auth] Failed to link githubId to existing user:', e));
              } else if (!existingByLogin) {
                // Step 3: Create new User.
                // Prevent unsafe collision with email/password accounts:
                // Never merge accounts solely because email matches unless verified!
                let safeEmail = ghEmail;
                if (safeEmail) {
                  const existingEmailUser = await prisma.user.findUnique({
                    where: { email: safeEmail },
                  }).catch(() => null);

                  if (existingEmailUser) {
                    // Do NOT overwrite or merge legacy account; assign non-colliding fallback
                    safeEmail = `${ghLogin}@users.noreply.github.com`;
                  }
                } else {
                  safeEmail = `${ghLogin}@users.noreply.github.com`;
                }

                await prisma.user.create({
                  data: {
                    githubId: ghId,
                    githubLogin: ghLogin,
                    name: ghName,
                    email: safeEmail,
                    image: ghAvatar,
                  },
                }).catch((e) => console.warn('[Auth] Failed to create new user on OAuth sign in:', e));
              }
            }
          }
        } catch (err) {
          console.warn('[Auth Event] Could not upsert user on OAuth sign in:', err);
        }
      }
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};


