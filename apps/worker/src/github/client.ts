import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

export function getInstallationOctokit(installationId: number): Octokit | null {
  const appId = process.env.GITHUB_APP_ID;
  const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!appId || !rawPrivateKey) {
    return null;
  }

  // Handle single-line escaped \n in env var
  const privateKey = rawPrivateKey.includes('\\n')
    ? rawPrivateKey.replace(/\\n/g, '\n')
    : rawPrivateKey;

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}
