import { loadEvaluationDashboardData } from '@/lib/eval-data';
import { ModelEvaluationView } from './ModelEvaluationView';

export const dynamic = 'force-dynamic';

export default async function ModelEvaluationPage() {
  const evalData = loadEvaluationDashboardData();
  return <ModelEvaluationView initialData={evalData} />;
}
