import { createPrivateKey } from 'node:crypto';
import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

let octokitOverride: ((installationId: number) => Octokit | null) | null = null;

export function setOctokitOverrideForTest(fn: ((installationId: number) => Octokit | null) | null) {
  octokitOverride = fn;
}

export function getInstallationOctokit(installationId: number): Octokit | null {
  if (octokitOverride) {
    return octokitOverride(installationId);
  }

  const appId = process.env.GITHUB_APP_ID;
  const rawPrivateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!appId || !rawPrivateKey || !rawPrivateKey.includes('PRIVATE KEY')) {
    return null;
  }

  // Handle single-line escaped \n in env var
  const privateKey = rawPrivateKey.includes('\\n')
    ? rawPrivateKey.replace(/\\n/g, '\n')
    : rawPrivateKey;

  try {
    createPrivateKey(privateKey);
  } catch {
    return null;
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}
