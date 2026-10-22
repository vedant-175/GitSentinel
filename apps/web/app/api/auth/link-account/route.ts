import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prisma } from '@ai-reviewer/db';
import { verifyPassword } from '../../../../lib/password';

export const dynamic = 'force-dynamic';

/**
 * Safe Account-Linking Endpoint
 *
 * Allows a user authenticated via GitHub OAuth to link a legacy email/password account,
 * but ONLY after explicitly proving ownership of both identities:
 * 1. Active GitHub OAuth session (proves ownership of GitHub account).
 * 2. Valid legacy password (proves ownership of the email account).
 *
 * Prevents unauthorized or automatic account merges based on email alone.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'You must be signed in with GitHub to link an existing account.' },
        { status: 401 }
      );
    }

    const githubLogin = session.user.login || session.user.githubLogin;
    if (!githubLogin) {
      return NextResponse.json(
        { error: 'GitHub account identity could not be verified from current session.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Please provide both your email address and password to link your account.' },
        { status: 400 }
      );
    }

    // Find the legacy user by email
    const legacyUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!legacyUser || !legacyUser.passwordHash) {
      return NextResponse.json(
        { error: 'No legacy account found matching this email address.' },
        { status: 404 }
      );
    }

    // Verify password ownership
    const isValid = verifyPassword(password, legacyUser.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password. Account linking rejected.' },
        { status: 401 }
      );
    }

    // Check if another account already has this GitHub ID
    const ghIdStr = (session.user as any).githubId;
    const ghId = ghIdStr ? BigInt(ghIdStr) : null;

    if (ghId && legacyUser.githubId && legacyUser.githubId !== ghId) {
      return NextResponse.json(
        { error: 'This legacy account is already linked to a different GitHub account.' },
        { status: 409 }
      );
    }

    // Link the GitHub identity to the legacy user record
    await prisma.user.update({
      where: { id: legacyUser.id },
      data: {
        githubLogin: githubLogin,
        ...(ghId ? { githubId: ghId } : {}),
        image: session.user.image || legacyUser.image,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully linked your GitHub account (@${githubLogin}) to ${email}. All previous review history, feedback, and settings have been preserved.`,
    });
  } catch (error: any) {
    console.error('[Link Account] Error during account linking:', error);
    return NextResponse.json(
      { error: 'Failed to link account due to an internal server error.' },
      { status: 500 }
    );
  }
}
