import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { ExploreClient } from './ExploreClient';

export const metadata: Metadata = {
  title: 'Explore Public Repositories | GitSentinel',
  description: 'Discover publicly accessible GitHub repositories and preview source code with GitSentinel.',
};

export const dynamic = 'force-dynamic';

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto w-full p-8 text-center text-sm text-slate-400 animate-pulse">
          Loading repository explorer...
        </div>
      }
    >
      <ExploreClient />
    </Suspense>
  );
}
