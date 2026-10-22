import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { prisma } from '@ai-reviewer/db';
import { syncUserRepositories } from './github-sync';

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
 * 1. GithubProvider with minimal OAuth scope ('read:user') - Primary & Default GitHub OAuth
 * Credentials-based and username-based authentication are retired in favor of GitHub-First OAuth.
 */
export function buildProviders() {
  const github = GithubProvider({
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    authorization: {
      url: 'https://github.com/login/oauth/authorize',
      params: {
        scope: 'read:user', // Narrow OAuth scope to the minimum required
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

  return [github];
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  secret,
  callbacks: {
    // Item 6: Keep network or DB writes out of the jwt callback
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

      // Handle client-side session update
      if (trigger === 'update' && session) {
        if (session.user?.isGithubConnected !== undefined) {
          token.isGithubConnected = session.user.isGithubConnected;
        }
        if (session.user?.githubLogin) {
          token.githubLogin = session.user.githubLogin;
          token.login = session.user.githubLogin;
        }
        if (session.user?.detectedGithubLogin !== undefined) {
          token.detectedGithubLogin = session.user.detectedGithubLogin;
        }
      }

      // Pure in-memory token transformation - NO network calls, NO database writes
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
      session.accessToken = token.accessToken;
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


