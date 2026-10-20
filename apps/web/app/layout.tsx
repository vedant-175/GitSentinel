import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Providers } from './components/Providers';
import { CyberChatbot } from './components/CyberChatbot';
import { GlobalSelectionAskAi } from './components/GlobalSelectionAskAi';

export const metadata: Metadata = {
  title: 'GitSentinel — AI Code Review & Security Gate',
  description: 'Autonomous AI PR Security, Fail-Closed Vulnerability Scanning & Fleet Telemetry.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('gitsentinel-theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-zinc-100 antialiased font-sans transition-colors duration-200">
        <Providers>
          <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#07090e]">
            <Navbar />
            
            <div className="flex-1 flex w-full">
              <Sidebar />
              <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">
                {children}
              </main>
            </div>

            {/* Global Interactive PR & Repo Security Copilot */}
            <CyberChatbot />

            {/* Contextual Floating 'Ask CyberOps AI' on text selection */}
            <GlobalSelectionAskAi />
          </div>
        </Providers>
      </body>
    </html>
  );
}
