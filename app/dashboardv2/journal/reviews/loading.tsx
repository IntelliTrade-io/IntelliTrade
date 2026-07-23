import GlassPanel from '@/components/journal/ui/GlassPanel';
import { journalRouteNavItems } from '@/lib/journal/navigation';

import JournalShell from '../_components/JournalShell';

export default function ReviewsLoading() {
  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <div className="foundation-card">
          <span className="metric-label">Loading</span>
          <span className="metric-value">Preparing reviews...</span>
          <p>
            Loading authenticated review rows and normalizing saved stats
            snapshots.
          </p>
        </div>
      </GlassPanel>
    </JournalShell>
  );
}
