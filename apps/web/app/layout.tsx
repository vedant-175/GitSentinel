import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from './components/Navbar';

export const metadata: Metadata = {
  title: 'AI Code Reviewer & PR Assistant',
  description: 'Autonomous GitHub App reviewing pull requests for bugs, security vulnerabilities, and code health in real-time.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <div className="relative min-h-screen flex flex-col">
          {/* Subtle Background Glow */}
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-indigo-600/10 via-purple-600/5 to-transparent blur-3xl pointer-events-none -z-10" />

          <Navbar />
          
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p>AI Code Review & PR Assistant — Built with Next.js 14, BullMQ, and PostgreSQL</p>
              <p className="font-mono text-slate-600">Prompt-Injection Shield Active</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
