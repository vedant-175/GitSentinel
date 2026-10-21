import { NextRequest, NextResponse } from 'next/server';
import { findGitHubAccountForEmail } from '../../../../lib/github-email';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email || !email.includes('@')) {
      return NextResponse.json({ hasGithub: false, error: 'Invalid email' }, { status: 400 });
    }

    const info = await findGitHubAccountForEmail(email);
    return NextResponse.json(info);
  } catch (error: any) {
    console.error('Error checking GitHub email:', error);
    return NextResponse.json({ hasGithub: false }, { status: 200 });
  }
}
