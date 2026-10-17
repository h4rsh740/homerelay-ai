import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: {
    default: 'HomeRelay AI',
    template: '%s | HomeRelay AI',
  },
  description:
    'HomeRelay AI: An AI household coordinator for the Alexa+ track. Natural language planning with explicit approval, verified MCP tool execution, and persistent PostgreSQL storage.',
  keywords: ['AI', 'household', 'MCP', 'automation', 'tasks', 'reminders'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
