import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen flex-col bg-[var(--background)] md:flex-row">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="app-main min-w-0 w-full flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-9">
        {children}
      </main>
    </div>
  );
}
