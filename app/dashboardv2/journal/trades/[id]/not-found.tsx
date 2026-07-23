import Link from 'next/link';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';

import JournalShell from '../../_components/JournalShell';

export default function TradeDetailNotFound() {
  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Trade detail"
          title="Trade not found or unavailable"
          description="The current authenticated and RLS-scoped detail loader can safely tell us that this trade cannot be shown for this session, but it does not distinguish between missing and unavailable records."
          actions={
            <Link className="journal-button" href="/dashboardv2/journal">
              Back to journal
            </Link>
          }
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="foundation-card">
          <p>Check the selected trade from the journal list and try again.</p>
        </div>
      </GlassPanel>
    </JournalShell>
  );
}
