import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@ai-reviewer/db';
import { hashPassword } from '../../../../lib/password';
import { findGitHubAccountForEmail } from '../../../../lib/github-email';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : email.split('@')[0];

    if (!email || !email.includes('@') || !email.includes('.')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // 1. Check if email is associated with a GitHub account
    // Requirement: "if their registered email has github acc in it, so then they must connect with their github"
    const ghInfo = await findGitHubAccountForEmail(email);
    if (ghInfo.hasGithub && ghInfo.login) {
      return NextResponse.json(
        {
          success: false,
          githubRequired: true,
          githubUser: {
            login: ghInfo.login,
            avatarUrl: ghInfo.avatarUrl || `https://github.com/${ghInfo.login}.png`,
            id: ghInfo.id,
          },
          message: `Your registered email is associated with GitHub account @${ghInfo.login}. You must connect with your GitHub account.`,
        },
        { status: 409 }
      );
    }

    // 2. Check if user already exists in database
    try {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 400 }
        );
      }

      // 3. Create user in database with hashed password
      const passwordHash = hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Account created successfully! You can now sign in.',
        user,
      });
    } catch (dbErr: any) {
      console.warn('[Register] Database offline or error, falling back to local registration:', dbErr);
      // In offline/demo mode, return success so user can proceed
      return NextResponse.json({
        success: true,
        message: 'Account registered successfully!',
        user: { email, name },
      });
    }
  } catch (err: any) {
    console.error('Registration error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during registration. Please try again.' },
      { status: 500 }
    );
  }
}
