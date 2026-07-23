import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';

import ExportRequestForm from '../_components/ExportRequestForm';
import JournalScaffoldPanel from '../_components/JournalScaffoldPanel';
import JournalShell from '../_components/JournalShell';

export default function ExportsPage() {
  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Exports"
          title="Journal data exports"
          description="This route exposes protected exports for trade-level journal data and persisted review snapshots. It stays deliberately narrow and excludes media, attachments, and unsupported analytics."
          actions={<span className="status-chip">Protected downloads</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="foundation-grid">
          <GlassPanel as="article" className="foundation-card">
            <span className="metric-label">Trades export</span>
            <p>
              Exports trades opened inside the requested date range as
              trade-level rows with safe derived metrics. Execution legs are not
              exported as separate rows here.
            </p>
          </GlassPanel>

          <GlassPanel as="article" className="foundation-card">
            <span className="metric-label">Reviews export</span>
            <p>
              Exports persisted review rows plus the normalized stored
              <strong> auto_stats </strong>
              snapshot. It does not export live recomputed review stats.
            </p>
          </GlassPanel>
        </div>
      </GlassPanel>

      <ExportRequestForm />

      <JournalScaffoldPanel
        kicker="Boundaries"
        title="What remains out of scope"
        description="The export contract is live, but this page is not trying to be a full reporting center."
        items={[
          'Screenshot/media export and attachment bundling remain separate work.',
          'No admin-style cross-user export path exists in this repo.',
          'Leg-level trade exports, review attachments, and delete flows are intentionally excluded.',
          'Advanced analytics beyond the current realized-stats foundation are not part of these files.',
        ]}
        actionHref="/dashboardv2/journal"
        actionLabel="Back to journal"
      />
    </JournalShell>
  );
}
