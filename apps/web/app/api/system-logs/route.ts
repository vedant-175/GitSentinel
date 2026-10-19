import { NextRequest, NextResponse } from 'next/server';
import { fetchSystemLogs } from '@/lib/logs-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 10;
    const tab = searchParams.get('tab') || 'all';
    const level = searchParams.get('level') || 'ALL';
    const component = searchParams.get('component') || 'ALL';
    const repository = searchParams.get('repository') || 'ALL';
    const search = searchParams.get('search') || '';
    const timeframe = searchParams.get('timeframe') || '24h';

    const data = await fetchSystemLogs({
      page,
      pageSize,
      tab,
      level,
      component,
      repository,
      search,
      timeframe,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('System logs API error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch system logs' },
      { status: 500 }
    );
  }
}
