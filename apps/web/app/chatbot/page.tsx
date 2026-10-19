import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CyberChatbotView } from '../cyberchatbot/CyberChatbotView';

export const dynamic = 'force-dynamic';

export default async function ChatbotPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const currentUserLogin = session?.user?.login || (session?.user as any)?.name || '';

  return <CyberChatbotView currentUserLogin={currentUserLogin} />;
}
