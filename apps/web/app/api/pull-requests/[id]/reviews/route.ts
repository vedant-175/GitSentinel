import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const prId = parseInt(params.id, 10);
    if (isNaN(prId)) {
      return NextResponse.json({ error: 'Invalid PR ID' }, { status: 400 });
    }

    const reviews = await prisma.review.findMany({
      where: { pullRequestId: prId },
      include: {
        issues: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json(serializeWithBigInt(reviews));
  } catch (error) {
    console.error('Failed to fetch PR reviews:', error);
    return NextResponse.json({ error: 'Failed to fetch PR reviews' }, { status: 500 });
  }
}
