import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CyberChatbotView } from './CyberChatbotView';

export const dynamic = 'force-dynamic';

export default async function CyberChatbotPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || 'vedant-175';

  return <CyberChatbotView currentUserLogin={currentUserLogin} />;
}
