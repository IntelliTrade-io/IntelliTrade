import { PropsWithChildren } from 'react';

import TopProgressBar from '@/components/journal/ui/TopProgressBar';

type JournalNavItem = {
  id: string;
  part: string;
  title: string;
  href: string;
};

type JournalShellProps = PropsWithChildren<{
  navItems: JournalNavItem[];
}>;

export default function JournalShell({ children, navItems }: JournalShellProps) {
  return (
    <div className="journal-page">
      <TopProgressBar />
      <main className="journal-main mx-auto w-full max-w-[1400px]">
        <div className="glass-panel">
          <div className="glass-panel-body flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="journal-kicker">Paid dashboard module</div>
              <h1 className="journal-brand-title">IntelliJournal</h1>
            </div>
            <nav className="journal-mobile-nav" aria-label="Journal navigation">
              <a className="journal-mobile-link" href="/dashboardv2">Dashboard</a>
            {navItems.map((item) => (
              <a key={item.id} className="journal-mobile-link" href={item.href}>
                <span className="journal-nav-icon" aria-hidden />
                <span className="journal-nav-title">{item.title}</span>
              </a>
            ))}
            </nav>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
