import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes: /login, /eval, /api/eval, GitHub webhook, health check, NextAuth endpoints, and static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/eval') ||
    pathname.startsWith('/api/eval') ||
    pathname.startsWith('/logs') ||
    pathname.startsWith('/api/system-logs') ||
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/repositories/files') ||
    pathname.startsWith('/api/repositories/review-file') ||
    pathname.startsWith('/api/webhooks/github') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.jpg')
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API routes return 401 Unauthorized
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dashboard UI pages redirect to /login
    const signInUrl = new URL('/login', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and assets
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:ico|png|jpg|jpeg|svg)).*)',
  ],
};
