import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      login?: string;
    } & DefaultSession['user'];
    accessToken?: string;
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
    installationIds?: number[];
  }
}
