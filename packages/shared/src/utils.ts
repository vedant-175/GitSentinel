/**
 * Item 10: Shared isBot() utility.
 * Matches user type === 'Bot' or login ending with '[bot]'.
 * NEVER substring 'bot' (which falsely flags names like 'bothwell', 'robotics', 'abbot').
 */
export function isBot(user?: { type?: string | null; login?: string | null } | null): boolean {
  if (!user) return false;
  if (user.type === 'Bot') return true;
  if (typeof user.login === 'string' && user.login.toLowerCase().endsWith('[bot]')) return true;
  return false;
}

/**
 * Checks whether a TCP port is actively accepting connections.
 * Resolves within timeoutMs (default 300ms) without hanging.
 */
export async function isPortReachable(port: number, host = '127.0.0.1', timeoutMs = 300): Promise<boolean> {
  if (typeof window !== 'undefined') {
    return false;
  }

  let net: typeof import('net');
  try {
    const imported = await import('net');
    net = (imported as any).default || imported;
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const cleanup = (result: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => cleanup(true));
    socket.once('timeout', () => cleanup(false));
    socket.once('error', () => cleanup(false));

    try {
      socket.connect(port, host);
    } catch {
      cleanup(false);
    }
  });
}

