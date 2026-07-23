import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';
import { getJournalReviews } from '@/lib/journal/server';
import {
  JournalReviewRecord,
  JournalReviewStatsContext,
} from '@/lib/journal/types';
import { requireAuthenticatedUser } from '@/lib/supabase/server';

import JournalScaffoldPanel from '../_components/JournalScaffoldPanel';
import JournalShell from '../_components/JournalShell';
import ReviewSaveForm from '../_components/ReviewSaveForm';

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Unavailable';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString();
  }

  return new Date(value).toLocaleDateString();
}

function formatRange(start: string, end: string) {
  return `${formatDate(start)} to ${formatDate(end)}`;
}

function formatCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return String(value);
}

function formatSignedNumber(value: number | null | undefined, suffix = '') {
  if (value == null || Number.isNaN(value)) {
    return `--${suffix}`;
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

function ReviewStatsSection({
  context,
  title,
}: {
  context: JournalReviewStatsContext;
  title: string;
}) {
  const snapshot = context.snapshot;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <div className="metric-label">{title}</div>
          <div className="table-secondary">{context.source.replaceAll('_', ' ')}</div>
        </div>
        <span className="status-chip">{snapshot.completeness}</span>
      </div>

      <div className="journal-grid journal-grid-3">
        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Total trades</span>
          <span className="metric-value">{formatCount(snapshot.total_trades)}</span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Closed</span>
          <span className="metric-value">{formatCount(snapshot.closed_trades)}</span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Partial</span>
          <span className="metric-value">
            {formatCount(snapshot.partially_closed_trades)}
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Open</span>
          <span className="metric-value">{formatCount(snapshot.open_trades)}</span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Net PnL (closed)</span>
          <span
            className={`metric-value ${
              (snapshot.net_pnl_closed ?? 0) >= 0
                ? 'metric-value-positive'
                : 'metric-value-negative'
            }`}
          >
            {formatSignedNumber(snapshot.net_pnl_closed)}
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Average resolved R</span>
          <span className="metric-value">
            {formatSignedNumber(snapshot.avg_r_closed_or_resolved, 'R')}
          </span>
        </GlassPanel>
      </div>

      <div className="foundation-card" style={{ marginTop: 16 }}>
        {snapshot.notes.length > 0 ? (
          <ul>
            {snapshot.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className="subtle-copy">No extra notes for this stats snapshot.</p>
        )}
      </div>
    </div>
  );
}

function ReviewRecordCard({ review }: { review: JournalReviewRecord }) {
  return (
    <GlassPanel as="section" tone="strong">
      <SectionHeader
        kicker={review.period === 'weekly' ? 'Weekly review' : 'Monthly review'}
        title={formatRange(review.period_start, review.period_end)}
        description="Saved notes and normalized auto_stats reflect the last persisted state for this period. Use the save surface above to refresh notes or re-save the realized snapshot."
        actions={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span className="status-chip">{review.period}</span>
            <span className="status-chip">Created {formatDate(review.created_at)}</span>
          </div>
        }
      />

      <div className="surface-divider" style={{ margin: '20px 0' }} />

      <div className="foundation-grid">
        <GlassPanel as="article">
          <div className="foundation-card">
            <div className="metric-label" style={{ marginBottom: 12 }}>
              Notes
            </div>
            <p>{review.notes ?? 'No notes were saved for this review.'}</p>
          </div>
        </GlassPanel>

        <GlassPanel as="article">
          <div className="foundation-card">
            <div className="metric-label" style={{ marginBottom: 12 }}>
              Schema status
            </div>
            <p>
              The current schema stores <strong>created_at</strong>, but it does
              not currently expose an <strong>updated_at</strong> column for
              reviews.
            </p>
          </div>
        </GlassPanel>
      </div>

      <div className="surface-divider" style={{ margin: '20px 0' }} />

      <div className="foundation-grid">
        <GlassPanel as="article">
          <ReviewStatsSection
            context={review.stored_stats}
            title="Saved review snapshot"
          />
        </GlassPanel>

        <GlassPanel as="article">
          <ReviewStatsSection
            context={review.current_period_stats}
            title="Current realized period basis"
          />
        </GlassPanel>
      </div>
    </GlassPanel>
  );
}

export default async function ReviewsPage() {
  const { supabase } = await requireAuthenticatedUser();

  try {
    const reviews = await getJournalReviews(supabase);

    return (
      <JournalShell navItems={journalRouteNavItems}>
        <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Reviews"
          title="Weekly and monthly reviews"
          description="Persisted reviews now load from the authenticated reviews table, and this page can save notes plus a normalized realized-stats snapshot back into the existing reviews table."
          actions={<span className="status-chip">Read + write</span>}
        />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          <ReviewSaveForm reviews={reviews} />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          {reviews.length === 0 ? (
            <div className="foundation-card">
              <div className="empty-state">No reviews have been saved yet.</div>
              <p>
                Use the save form above to create the first weekly or monthly
                review for this account. The snapshot will be derived from the
                current realized-stats foundation for the selected period.
              </p>
            </div>
          ) : (
            <div className="foundation-card">
              <p>
                {reviews.length} review{reviews.length === 1 ? '' : 's'} loaded.
                Saving an existing period refreshes its notes and normalized
                stats snapshot. Older snapshots may still be partial if they
                were stored before the current stats foundation was defined.
              </p>
            </div>
          )}
        </GlassPanel>

        {reviews.map((review) => (
          <ReviewRecordCard key={review.id} review={review} />
        ))}

        <JournalScaffoldPanel
          kicker="Boundaries"
          title="What remains out of scope"
          description="Reviews can now save notes plus the normalized stats snapshot, but the page still stays intentionally narrow."
          items={[
            'Only notes and the normalized auto_stats snapshot are persisted here.',
            'Delete flows and richer review management remain separate work.',
            'Attachments, screenshot linking, and gallery behavior remain separate work.',
            'Exports stay on the dedicated exports page.',
            'Advanced analytics beyond the current realized-stats basis are intentionally excluded.',
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
            kicker="Reviews"
            title="Reviews could not be loaded"
            description="The route is protected and the review loader is wired, but the current session could not load the reviews table or its trade context."
            actions={<span className="status-chip">Load failed</span>}
          />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          <div className="error-state">
            {error instanceof Error
              ? error.message
              : 'Reviews could not be loaded.'}
          </div>
        </GlassPanel>
      </JournalShell>
    );
  }
}
