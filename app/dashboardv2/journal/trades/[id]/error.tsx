'use client';

import Link from 'next/link';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';

import JournalShell from '../../_components/JournalShell';

export default function TradeDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Trade detail"
          title="Trade detail could not be loaded"
          description="A server-side error prevented the authenticated detail view from rendering."
          actions={
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="journal-button" onClick={reset} type="button">
                Retry
              </button>
              <Link className="journal-button" href="/dashboardv2/journal">
                Back to journal
              </Link>
            </div>
          }
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="error-state">{error.message || 'Unexpected trade detail error.'}</div>
      </GlassPanel>
    </JournalShell>
  );
}
