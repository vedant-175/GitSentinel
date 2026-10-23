import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAdminSession, handleAuthError } from '@/lib/auth-helpers';

export async function GET() {
  try {
    await requireAdminSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Administrator privileges required' }, { status: 403 });
  }

  const possiblePaths = [
    path.join(process.cwd(), 'eval', 'results.json'),
    path.join(process.cwd(), '..', '..', 'eval', 'results.json'),
    path.join(process.cwd(), '..', 'eval', 'results.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return new NextResponse(content, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="benchmark-results.json"',
          },
        });
      } catch (e) {
        console.error('Failed reading results.json:', e);
      }
    }
  }

  return NextResponse.json({ error: 'Results not found' }, { status: 404 });
}
