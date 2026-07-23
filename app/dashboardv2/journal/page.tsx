import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalSectionNavItems } from '@/lib/journal/navigation';

import Dashboard from './_components/Dashboard';
import JournalShell from './_components/JournalShell';
import TradesTable from './_components/TradesTable';

export const dynamic = 'force-dynamic';

export default function JournalPage({
  searchParams,
}: {
  searchParams?: {
    tradeDeleted?: string;
    tradeCleanup?: string;
  };
}) {
  const tradeDeleted = searchParams?.tradeDeleted === '1';
  const tradeCleanupWarning = searchParams?.tradeCleanup === 'storage-warning';

  return (
    <JournalShell navItems={journalSectionNavItems}>
      {tradeDeleted ? (
        <GlassPanel as="section">
          <div className={tradeCleanupWarning ? 'warning-state' : 'success-state'}>
            {tradeCleanupWarning
              ? 'Trade deleted. Screenshot storage cleanup could not be fully confirmed, so bucket policies and object state should be checked.'
              : 'Trade deleted successfully.'}
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel as="section" id="overview" tone="strong">
        <SectionHeader
          kicker="IntelliTrade"
          title="Trading journal workspace"
          description="The approved Macro Mastery visual language is now wired into the real Next.js journal shell, protected routes, and reusable feature surfaces rather than living only in the prototype reference."
          actions={<span className="status-chip">App Router + Supabase + typed APIs</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="journal-grid journal-grid-3">
          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Current state</span>
            <span className="metric-value">Journal MVP</span>
            <span className="metric-hint">Core journal routes now cover trades, detail, realized stats, review save flows, exports, and screenshots.</span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Foundation fix</span>
            <span className="metric-value">Providers wired</span>
            <span className="metric-hint">React Query is now supported from the root app shell.</span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Visual target</span>
            <span className="metric-value">Macro Mastery</span>
            <span className="metric-hint">Black glass surfaces, restrained purple accents, sticky nav, and progress affordance.</span>
          </GlassPanel>
        </div>
      </GlassPanel>

      <div id="performance">
        <Dashboard />
      </div>

      <div id="trades">
        <TradesTable />
      </div>

      <GlassPanel as="section" id="roadmap">
        <SectionHeader
          kicker="Current boundaries"
          title="What is live and what is still narrow"
          description="The route structure is stable. Remaining gaps are mostly around deeper workflow controls, richer reporting, and environment confirmation."
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="foundation-grid">
          <GlassPanel as="article" className="foundation-card">
            <span className="metric-label">Live journal flows</span>
            <p>
              Add-trade, trade detail, top-level trade edits, leg replacement,
              screenshot upload, reviews, and exports now run through protected
              user-scoped flows.
            </p>
            <ul>
              <li>User-scoped routes</li>
              <li>Explicit loading, empty, and error states</li>
              <li>Shared journal types and helper modules</li>
            </ul>
          </GlassPanel>

          <GlassPanel as="article" className="foundation-card">
            <span className="metric-label">Remaining limits</span>
            <p>
              Cookie-backed auth guards and SSR session refresh are in place.
              The remaining work is feature depth and environment confirmation,
              not rebuilding auth or the journal shell.
            </p>
            <ul>
              <li>Delete cleanup and leg replacement are best-effort, not transactional</li>
              <li>Review and export contracts stay intentionally narrow</li>
              <li>Bucket policies and final go-live checks still need human confirmation</li>
            </ul>
          </GlassPanel>
        </div>
      </GlassPanel>
    </JournalShell>
  );
}
