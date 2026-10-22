import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Legacy registration endpoint - RETIRED.
 * Email and password registration has been retired in favor of primary GitHub OAuth authentication.
 * Existing database records, passwords, and user data remain safely preserved.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Email and password registration has been retired. Please use "Continue with GitHub" to sign in.',
      code: 'AUTH_METHOD_RETIRED',
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Email and password registration has been retired. Please use "Continue with GitHub" to sign in.',
      code: 'AUTH_METHOD_RETIRED',
    },
    { status: 410 }
  );
}
