import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
}

export async function POST(req: NextRequest) {
  try {
    const { repoFullName, path = '', defaultBranch = 'main' } = await req.json();

    if (!repoFullName) {
      return NextResponse.json({ error: 'repoFullName is required' }, { status: 400 });
    }

    const cleanPath = (path || '').replace(/^\/+|\/+$/g, '');
    const isLikelyFile = /\.[a-zA-Z0-9_-]+$/i.test(cleanPath);

    // -------------------------------------------------------------------------
    // Tier 1: If requested target is explicitly a file, fetch raw content immediately
    // -------------------------------------------------------------------------
    if (cleanPath && isLikelyFile) {
      for (const branch of [defaultBranch, 'main', 'master']) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${cleanPath}`;
          const rawRes = await fetch(rawUrl, {
            headers: { 'User-Agent': 'GitSentinel-CodeExplorer/1.0' },
          });
          if (rawRes.ok) {
            const content = await rawRes.text();
            return NextResponse.json({
              isDir: false,
              activeFilePath: cleanPath,
              activeFileContent: content,
              size: content.length,
              currentPath: cleanPath,
            });
          }
        } catch {
          // try next branch
        }
      }
    }

    // -------------------------------------------------------------------------
    // Tier 2: Try GitHub Contents REST API
    // -------------------------------------------------------------------------
    try {
      const apiUrl = `https://api.github.com/repos/${repoFullName}/contents/${cleanPath}`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'GitSentinel-CodeExplorer/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        if (Array.isArray(data)) {
          const files: FileItem[] = data
            .map((item) => ({
              name: item.name,
              path: item.path,
              type: item.type === 'dir' ? ('dir' as const) : ('file' as const),
              size: item.size || 0,
            }))
            .sort((a, b) =>
              a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
            );

          // Auto-load first code file if looking at a directory
          const firstCodeFile =
            files.find((f) => /\.(py|ts|tsx|js|jsx|json|md|html|css|toml|ya?ml)$/i.test(f.name) && f.type === 'file') ||
            files.find((f) => f.type === 'file');

          let activeFileContent = null;
          let activeFilePath = null;

          if (firstCodeFile) {
            activeFilePath = firstCodeFile.path;
            for (const b of [defaultBranch, 'main', 'master']) {
              try {
                const rawRes = await fetch(
                  `https://raw.githubusercontent.com/${repoFullName}/${b}/${firstCodeFile.path}`,
                  { headers: { 'User-Agent': 'GitSentinel-CodeExplorer/1.0' } }
                );
                if (rawRes.ok) {
                  activeFileContent = await rawRes.text();
                  break;
                }
              } catch {
                // Ignore raw fetch failure
              }
            }
          }

          return NextResponse.json({
            isDir: true,
            files,
            currentPath: cleanPath,
            activeFilePath,
            activeFileContent,
          });
        } else if (data.content) {
          const content = Buffer.from(data.content, 'base64').toString('utf8');
          return NextResponse.json({
            isDir: false,
            activeFilePath: data.path,
            activeFileContent: content,
            size: data.size,
            currentPath: cleanPath,
          });
        }
      }
    } catch {
      // Fall through to Tier 3 on API failure / rate limits
    }

    // -------------------------------------------------------------------------
    // Tier 3: Zero-Rate-Limit Embedded Web Payload Fallback
    // -------------------------------------------------------------------------
    try {
      const branches = [defaultBranch, 'main', 'master'];
      for (const branch of branches) {
        const webUrl = cleanPath
          ? `https://github.com/${repoFullName}/tree/${branch}/${cleanPath}`
          : `https://github.com/${repoFullName}`;

        const res = await fetch(webUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        if (res.ok) {
          const html = await res.text();
          const scriptMatch = html.match(
            /<script type="application\/json" data-target="react-app\.embeddedData">(.*?)<\/script>/s
          );

          if (scriptMatch) {
            const payloadData = JSON.parse(scriptMatch[1]);
            const treeItems =
              payloadData?.payload?.codeViewRepoRoute?.tree?.items ||
              payloadData?.payload?.codeViewTreeRoute?.tree?.items ||
              [];

            if (treeItems.length > 0) {
              const files: FileItem[] = treeItems
                .map((item: any) => ({
                  name: item.name,
                  path: item.path,
                  type: item.contentType === 'directory' ? ('dir' as const) : ('file' as const),
                  size: 0,
                }))
                .sort((a: FileItem, b: FileItem) =>
                  a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
                );

              // Auto-load first file content
              const firstCodeFile =
                files.find((f) => /\.(py|ts|tsx|js|jsx|json|md|html|css|toml|ya?ml)$/i.test(f.name) && f.type === 'file') ||
                files.find((f) => f.type === 'file');

              let activeFileContent = null;
              let activeFilePath = null;

              if (firstCodeFile) {
                activeFilePath = firstCodeFile.path;
                for (const b of [defaultBranch, 'main', 'master']) {
                  try {
                    const rawRes = await fetch(
                      `https://raw.githubusercontent.com/${repoFullName}/${b}/${firstCodeFile.path}`,
                      { headers: { 'User-Agent': 'GitSentinel-CodeExplorer/1.0' } }
                    );
                    if (rawRes.ok) {
                      activeFileContent = await rawRes.text();
                      break;
                    }
                  } catch {
                    // Ignore raw fetch failure
                  }
                }
              }

              return NextResponse.json({
                isDir: true,
                files,
                currentPath: cleanPath,
                activeFilePath,
                activeFileContent,
              });
            }
          }
        }
      }
    } catch (fallbackErr) {
      console.warn('[Repo Files API web fallback error]:', fallbackErr);
    }

    // -------------------------------------------------------------------------
    // Tier 4: Fallback for single file if not resolved yet
    // -------------------------------------------------------------------------
    if (cleanPath) {
      for (const branch of [defaultBranch, 'main', 'master']) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${cleanPath}`;
          const rawRes = await fetch(rawUrl, {
            headers: { 'User-Agent': 'GitSentinel-CodeExplorer/1.0' },
          });
          if (rawRes.ok) {
            const content = await rawRes.text();
            return NextResponse.json({
              isDir: false,
              activeFilePath: cleanPath,
              activeFileContent: content,
              size: content.length,
              currentPath: cleanPath,
            });
          }
        } catch {
          // Ignore raw fetch failure
        }
      }
    }

    return NextResponse.json({
      isDir: true,
      files: [],
      currentPath: cleanPath,
      activeFilePath: null,
      activeFileContent: null,
    });
  } catch (err: any) {
    console.error('[Repo Files API error]:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
