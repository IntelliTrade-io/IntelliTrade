import Link from 'next/link';
import { notFound } from 'next/navigation';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { journalRouteNavItems } from '@/lib/journal/navigation';
import { getTradeDetailById, getTradeFormLookups } from '@/lib/journal/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import JournalShell from '../../_components/JournalShell';
import TradeDeleteForm from '../../_components/TradeDeleteForm';
import TradeEditForm from '../../_components/TradeEditForm';
import TradeLegEditForm from '../../_components/TradeLegEditForm';
import TradeScreenshotUploadForm from '../../_components/TradeScreenshotUploadForm';

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Unavailable';
  }

  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(fractionDigits);
}

function formatSignedNumber(
  value: number | null | undefined,
  fractionDigits = 2,
  suffix = '',
) {
  if (value == null || Number.isNaN(value)) {
    return `--${suffix}`;
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(fractionDigits)}${suffix}`;
}

export default async function TradeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const [trade, lookupResult] = await Promise.all([
    getTradeDetailById(supabase, params.id),
    getTradeFormLookups(supabase)
      .then((lookups) => ({ lookups, error: null as string | null }))
      .catch((error) => ({
        lookups: null,
        error:
          error instanceof Error
            ? error.message
            : 'Trade lookups could not be loaded.',
      })),
  ]);

  if (!trade) {
    notFound();
  }

  const isPositive = trade.metrics.pnl_net >= 0;
  const accountLabel = trade.account_name
    ? `${trade.account_name}${trade.account_broker ? ` | ${trade.account_broker}` : ''}`
    : 'Account label unavailable';
  const instrumentLabel = `${trade.symbol ?? 'Unknown'}${
    trade.asset_class ? ` | ${trade.asset_class}` : ''
  }`;

  return (
    <JournalShell navItems={journalRouteNavItems}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Trade detail"
          title={trade.symbol ? `${trade.symbol} ${trade.bias}` : `Trade ${trade.id}`}
          description="Authenticated trade detail is live at the page layer. Supported top-level edits, full-set leg replacement, screenshot upload, and delete safety controls are wired here without broadening into generic workflow mutation."
          actions={
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span
                className={`status-chip ${
                  isPositive ? 'status-chip-positive' : 'status-chip-negative'
                }`}
              >
                {formatSignedNumber(trade.metrics.pnl_net)}
              </span>
              <Link className="journal-button" href="/dashboardv2/journal">
                Back to journal
              </Link>
            </div>
          }
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="journal-grid journal-grid-3">
          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Opened</span>
            <span className="metric-value">{formatDateTime(trade.opened_at)}</span>
            <span className="metric-hint">{accountLabel}</span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Average entry</span>
            <span className="metric-value">
              {formatNumber(trade.metrics.avg_entry, 4)}
            </span>
            <span className="metric-hint">
              Entry size {formatNumber(trade.metrics.qty, 2)}
            </span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Average exit</span>
            <span className="metric-value">
              {formatNumber(trade.metrics.avg_exit, 4)}
            </span>
            <span className="metric-hint">
              {trade.closed_at
                ? `Closed ${formatDateTime(trade.closed_at)}`
                : 'Trade is still open or partially open.'}
            </span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Net PnL</span>
            <span
              className={`metric-value ${
                isPositive ? 'metric-value-positive' : 'metric-value-negative'
              }`}
            >
              {formatSignedNumber(trade.metrics.pnl_net)}
            </span>
            <span className="metric-hint">
              Gross {formatSignedNumber(trade.metrics.pnl_gross)} before fees and
              slippage.
            </span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">R multiple</span>
            <span className="metric-value">
              {trade.metrics.r == null
                ? '--'
                : formatSignedNumber(trade.metrics.r, 2, 'R')}
            </span>
            <span className="metric-hint">
              Risk {trade.risk_per_trade == null ? '--' : formatNumber(trade.risk_per_trade)} |
              Target {trade.target_r == null ? '--' : formatNumber(trade.target_r)}R
            </span>
          </GlassPanel>

          <GlassPanel as="article" className="metric-card">
            <span className="metric-label">Execution cost</span>
            <span className="metric-value">
              {formatNumber(trade.metrics.fees_total + trade.metrics.slippage_total)}
            </span>
            <span className="metric-hint">
              Fees {formatNumber(trade.metrics.fees_total)} | Slippage{' '}
              {formatNumber(trade.metrics.slippage_total)}
            </span>
          </GlassPanel>
        </div>
      </GlassPanel>

      <TradeEditForm
        lookups={lookupResult.lookups}
        lookupsError={lookupResult.error}
        trade={trade}
      />

      <div className="foundation-grid">
        <GlassPanel as="section">
          <SectionHeader
            kicker="Context"
            title="Trade context"
            description="This panel stays read-only for quick context. Use the edit section above for supported top-level field changes."
          />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          <div className="foundation-card">
            <p>
              <strong className="table-primary">Instrument:</strong> {instrumentLabel}
            </p>
            <p>
              <strong className="table-primary">Strategy:</strong>{' '}
              {trade.strategy_name ?? 'No strategy attached'}
            </p>
            <p>
              <strong className="table-primary">Setup:</strong>{' '}
              {trade.setup ?? 'No setup recorded'}
            </p>
            <p>
              <strong className="table-primary">Thesis:</strong>{' '}
              {trade.thesis ?? 'No thesis recorded'}
            </p>
            <div>
              <div className="metric-label" style={{ marginBottom: 10 }}>
                Tags
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {trade.tags.length > 0 ? (
                  trade.tags.map((tag) => (
                    <span key={tag} className="table-chip">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="subtle-copy">No tags recorded</span>
                )}
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel as="section">
          <SectionHeader
            kicker="Screenshots"
            title="Chart images"
            description="Uploads store stable storage object paths in the trade record. Signed display URLs are generated at read time so the bucket can stay private."
          />

          <div className="surface-divider" style={{ margin: '20px 0' }} />

          <div className="foundation-card">
            <TradeScreenshotUploadForm tradeId={trade.id} />

            <div className="surface-divider" style={{ margin: '8px 0' }} />

            <p>
              Stored screenshot references:{' '}
              <strong className="table-primary">
                {trade.screenshot_urls.length}
              </strong>
            </p>

            {trade.screenshots.length === 0 ? (
              <div className="empty-state">
                No screenshots have been uploaded for this trade yet.
              </div>
            ) : (
              <div className="screenshot-grid">
                {trade.screenshots.map((screenshot) => (
                  <div key={screenshot.path} className="screenshot-card">
                    {screenshot.signed_url ? (
                      <>
                        {/* Signed private-bucket URLs are generated per request, so a plain img keeps this slice simple. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={`Trade screenshot ${screenshot.path}`}
                          className="screenshot-image"
                          src={screenshot.signed_url}
                        />
                      </>
                    ) : (
                      <div className="error-state">
                        Screenshot could not be displayed from the stored path.
                      </div>
                    )}
                    <div className="screenshot-meta">
                      <div className="table-primary">{screenshot.path}</div>
                      <div className="table-secondary">
                        {screenshot.status === 'available'
                          ? 'Signed URL generated for this request.'
                          : 'Stored object is missing or unreadable with the current bucket policy.'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel as="section">
        <SectionHeader
          kicker="Execution"
          title="Execution legs"
          description="This editor replaces the full execution-leg set in one controlled save. It is intentionally narrower than a full reconstruction workflow."
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <TradeLegEditForm
          legs={trade.trade_legs}
          openedAt={trade.opened_at}
          tradeId={trade.id}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="table-shell">
          <div className="table-scroll">
            <table className="journal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Fee</th>
                  <th>Slippage</th>
                </tr>
              </thead>
              <tbody>
                {trade.trade_legs.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={6}>
                      No execution legs were returned for this trade.
                    </td>
                  </tr>
                ) : (
                  trade.trade_legs.map((leg, index) => (
                    <tr key={leg.id ?? `${leg.executed_at}-${index}`}>
                      <td>
                        <div className="table-primary">
                          {formatDateTime(leg.executed_at)}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-chip ${
                            leg.side === 'buy'
                              ? 'status-chip-positive'
                              : 'status-chip-negative'
                          }`}
                        >
                          {leg.side}
                        </span>
                      </td>
                      <td>{formatNumber(leg.qty, 2)}</td>
                      <td>{formatNumber(leg.price, 4)}</td>
                      <td>{formatNumber(leg.fee ?? 0)}</td>
                      <td>{formatNumber(leg.slippage ?? 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </GlassPanel>

      <TradeDeleteForm
        screenshotCount={trade.screenshot_urls.length}
        tradeId={trade.id}
      />
    </JournalShell>
  );
}
