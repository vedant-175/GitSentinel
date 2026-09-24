import { NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const repositories = await prisma.repository.findMany({
      include: {
        installation: true,
        _count: {
          select: { pullRequests: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(serializeWithBigInt(repositories));
  } catch (error) {
    console.error('Failed to fetch repositories:', error);
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 });
  }
}
