'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, CheckSquare, Clock, FileCheck2, Home, Menu, PanelTop, Plus, Route, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/components/ui/utils';

const workspaceLinks = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/history', label: 'Activity history', icon: Clock },
];

const previewLinks = [
  { href: '/new-request', label: 'New request', icon: Plus },
  { href: '/plan', label: 'Plan preview', icon: Route },
  { href: '/execution', label: 'Execution progress', icon: PanelTop },
  { href: '/results', label: 'Final results', icon: FileCheck2 },
];

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[13px] border border-[rgba(83,216,196,0.28)] bg-[var(--accent)] text-[var(--navy-950)] shadow-[var(--shadow-teal)]"><Zap size={19} strokeWidth={2.6} /></div>
      <div className="min-w-0"><p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">HomeRelay</p><p className="truncate text-[10px] uppercase tracking-[0.13em] text-[var(--text-muted)]">A little less on your mind</p></div>
    </div>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:p-5">
      <div className="mb-9 pt-1"><Brand /></div>
      <nav aria-label="Primary" className="space-y-7">
        {[{ title: 'Your household', links: workspaceLinks }, { title: 'Explore the flow', links: previewLinks }].map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{group.title}</p>
            <div className="space-y-0.5">
              {group.links.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={onNavigate}
                  className={cn('nav-link group', pathname === href && 'active')}>
                  <Icon aria-hidden="true" size={17} className="shrink-0 opacity-80 transition-opacity group-hover:opacity-100 group-[.active]:opacity-100" /><span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-[var(--teal-400)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--teal-400)]" />
            <ShieldCheck aria-hidden="true" size={15} />
            Verified MCP System
          </div>
          <p className="text-[11px] leading-[1.55] text-[var(--text-secondary)]">
            Actions require explicit approval before execution. All tasks and reminders persist to PostgreSQL.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-[var(--border)] px-1 pt-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-overlay)] text-[11px] font-semibold text-[var(--slate-300)]">HR</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--text-primary)]">HomeRelay Household</p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">Alexa+ Track · MCP Connected</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[rgba(9,24,39,0.94)] px-4 py-3 backdrop-blur-md md:hidden">
        <Brand />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation"><Menu aria-hidden="true" /></Button></DialogTrigger>
          <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-[min(328px,calc(100%_-_1rem))] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 bg-[var(--navy-900)] p-0 shadow-[var(--shadow-md)]">
            <DialogTitle className="sr-only">Household navigation</DialogTitle>
            <DialogDescription className="sr-only">Navigate the household workspace and the frontend preview screens.</DialogDescription>
            <Navigation onNavigate={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </header>
      <aside aria-label="Household navigation" className="sticky top-0 hidden h-dvh w-[252px] shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--navy-900)] md:block">
        <Navigation />
      </aside>
    </>
  );
}
