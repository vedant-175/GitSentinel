import { fetchSystemLogs } from '@/lib/logs-data';
import { SystemLogsView } from './SystemLogsView';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  const initialData = await fetchSystemLogs({
    page: 1,
    pageSize: 10,
    tab: 'all',
  });

  return <SystemLogsView initialData={initialData} />;
}
