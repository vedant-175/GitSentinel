import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reviewId = parseInt(params.id, 10);
    if (isNaN(reviewId)) {
      return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 });
    }

    const issues = await prisma.reviewIssue.findMany({
      where: { reviewId },
      orderBy: [
        { severity: 'asc' }, // critical, suggestion, warning
        { filePath: 'asc' },
        { lineNumber: 'asc' },
      ],
    });

    return NextResponse.json(serializeWithBigInt(issues));
  } catch (error) {
    console.error('Failed to fetch review issues:', error);
    return NextResponse.json({ error: 'Failed to fetch review issues' }, { status: 500 });
  }
}
