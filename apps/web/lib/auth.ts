import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.NEXTAUTH_GITHUB_CLIENT_ID || 'dummy-client-id',
      clientSecret: process.env.NEXTAUTH_GITHUB_CLIENT_SECRET || 'dummy-client-secret',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-key-32-chars-long!',
  callbacks: {
    async session({ session, token }) {
      if (session?.user && token?.sub) {
        // Map user ID and GitHub login
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/api/auth/signin',
  },
};
