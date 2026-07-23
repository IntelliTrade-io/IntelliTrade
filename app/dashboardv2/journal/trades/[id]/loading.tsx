import GlassPanel from '@/components/journal/ui/GlassPanel';
import { journalRouteNavItems } from '@/lib/journal/navigation';

import JournalShell from '../../_components/JournalShell';

export default function TradeDetailLoading() {
  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <div className="foundation-card">
          <span className="metric-label">Loading</span>
          <span className="metric-value">Preparing trade detail...</span>
          <p>Loading the authenticated trade record, derived metrics, and execution legs.</p>
        </div>
      </GlassPanel>
    </JournalShell>
  );
}
