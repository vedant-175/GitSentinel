import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      login?: string;
      authMethod?: 'email' | 'username' | 'oauth';
      isGithubConnected?: boolean;
      detectedGithubLogin?: string | null;
      githubLogin?: string | null;
    } & DefaultSession['user'];
    installationIds: number[];
  }

  interface Profile {
    login?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    login?: string;
    email?: string;
    authMethod?: 'email' | 'username' | 'oauth';
    isGithubConnected?: boolean;
    detectedGithubLogin?: string | null;
    githubLogin?: string | null;
    installationIds?: number[];
  }
}

