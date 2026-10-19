import { NextRequest, NextResponse } from 'next/server';
import { fetchSystemLogs } from '@/lib/logs-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const tab = searchParams.get('tab') || 'all';
    const level = searchParams.get('level') || 'ALL';
    const component = searchParams.get('component') || 'ALL';
    const repository = searchParams.get('repository') || 'ALL';
    const search = searchParams.get('search') || '';

    const data = await fetchSystemLogs({
      page: 1,
      pageSize: 3500,
      tab,
      level,
      component,
      repository,
      search,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json') {
      return new NextResponse(JSON.stringify(data.logs, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="system-logs-${timestamp}.json"`,
        },
      });
    }

    // Generate CSV
    const headers = ['Time (IST)', 'Level', 'Component', 'Message', 'Repository', 'PR Number', 'Duration'];
    const rows = data.logs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.level}"`,
      `"${l.component}"`,
      `"${l.message.replace(/"/g, '""')}"`,
      `"${l.repo || '-'}"`,
      `"${l.prNumber ? '#' + l.prNumber : '-'}"`,
      `"${l.duration}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="system-logs-${timestamp}.csv"`,
      },
    });
  } catch (err: any) {
    console.error('System logs export error:', err);
    return NextResponse.json(
      { error: 'Failed to export logs' },
      { status: 500 }
    );
  }
}
