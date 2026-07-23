import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';
import { getTradeFormLookups } from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';

import AddTradeForm from '../../_components/AddTradeForm';
import JournalScaffoldPanel from '../../_components/JournalScaffoldPanel';
import JournalShell from '../../_components/JournalShell';

export default async function NewTradePage() {
  const { supabase } = await requireAuthenticatedUser();

  try {
    const lookups = await getTradeFormLookups(supabase);

    return (
      <JournalShell navItems={journalRouteNavItems}>
        <AddTradeForm lookups={lookups} />

        <JournalScaffoldPanel
          kicker="Current scope"
          title="What this page covers"
          description="The add-trade route now loads user-scoped options and submits real trades. Screenshot upload and deeper analytics stay on their own pages."
          items={[
            'Lookups are loaded server-side through the authenticated Supabase SSR client.',
            'Trades are submitted to the existing authenticated POST /api/journal route.',
            'Strategies remain optional; accounts and instruments are required.',
            'If no accounts or instruments exist yet, the page shows an honest prerequisite state.',
          ]}
          actionHref="/dashboardv2/journal"
          actionLabel="Back to journal"
        />
      </JournalShell>
    );
  } catch (error) {
    return (
      <JournalShell navItems={journalRouteNavItems}>
        <GlassPanel as="section" tone="strong">
          <SectionHeader
            kicker="Add trade"
            title="Unable to load trade form options"
            description="The route is protected and ready for live lookups, but the required account, instrument, or strategy data could not be loaded for this session."
            actions={<span className="status-chip">Lookup load failed</span>}
          />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          <div className="error-state">{error instanceof Error ? error.message : 'Trade form options could not be loaded.'}</div>
        </GlassPanel>
      </JournalShell>
    );
  }
}
