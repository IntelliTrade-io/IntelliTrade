'use client';

import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { getJournalStats } from '@/lib/journal/api';
import { JournalDashboardStats } from '@/lib/journal/types';

Chart.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
);

function formatCount(value: number | null | undefined) {
  if (value == null) {
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

function formatChartLabel(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export default function Dashboard() {
  const { data, error, isLoading } = useQuery<JournalDashboardStats>({
    queryKey: ['journal-stats'],
    queryFn: getJournalStats,
  });
  const equity = data?.equity ?? [];
  const labels = equity.map((point) => formatChartLabel(point.d));
  const values = equity.map((point) => point.v);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Realized equity',
        data: values,
        fill: true,
        tension: 0.35,
        borderColor: 'rgba(139, 92, 246, 0.9)',
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  return (
    <GlassPanel as="section">
      <SectionHeader
        kicker="Performance"
        title="Overview and equity pulse"
        description="Dashboard stats now come from a dedicated authenticated stats contract built from the full trade set. Equity is realized net to date, not mark-to-market."
        actions={<span className="status-chip">Realized stats</span>}
      />

      <div className="surface-divider" style={{ margin: '20px 0' }} />

      <div className="journal-grid journal-grid-3">
        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Total trades</span>
          <span className="metric-value">
            {formatCount(data?.total_trades)}
          </span>
          <span className="metric-hint">
            All authenticated trades in the stats set.
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Closed trades</span>
          <span className="metric-value">
            {formatCount(data?.closed_trades)}
          </span>
          <span className="metric-hint">
            Entry and exit quantity are fully matched.
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Partial closes</span>
          <span className="metric-value">
            {formatCount(data?.partially_closed_trades)}
          </span>
          <span className="metric-hint">
            At least one exit exists, but some size remains open.
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Open trades</span>
          <span className="metric-value">
            {formatCount(data?.open_trades)}
          </span>
          <span className="metric-hint">No exit legs have been recorded yet.</span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Net PnL (closed)</span>
          <span
            className={`metric-value ${
              (data?.net_pnl_closed ?? 0) >= 0
                ? 'metric-value-positive'
                : 'metric-value-negative'
            }`}
          >
            {formatSignedNumber(data?.net_pnl_closed)}
          </span>
          <span className="metric-hint">
            Only fully closed trades are included here.
          </span>
        </GlassPanel>

        <GlassPanel as="article" className="metric-card">
          <span className="metric-label">Average resolved R</span>
          <span className="metric-value">
            {formatSignedNumber(data?.avg_r_closed_or_resolved, 'R')}
          </span>
          <span className="metric-hint">
            Closed and partially closed trades with risk defined.
          </span>
        </GlassPanel>
      </div>

      <div className="dashboard-chart">
        {isLoading ? (
          <div className="empty-state">Loading authenticated stats...</div>
        ) : error ? (
          <div className="error-state">{error.message}</div>
        ) : equity.length === 0 ? (
          <div className="empty-state">
            No realized equity points are available yet.
          </div>
        ) : (
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                x: {
                  grid: {
                    color: 'rgba(197, 213, 255, 0.06)',
                  },
                  ticks: {
                    color: 'rgba(203, 215, 228, 0.65)',
                  },
                },
                y: {
                  grid: {
                    color: 'rgba(197, 213, 255, 0.06)',
                  },
                  ticks: {
                    color: 'rgba(203, 215, 228, 0.65)',
                  },
                },
              },
            }}
          />
        )}
      </div>

      <div className="foundation-card" style={{ marginTop: 20 }}>
        <div className="metric-label" style={{ marginBottom: 10 }}>
          Calculation rules
        </div>
        <ul>
          {(data?.assumptions.notes ?? [
            'Equity uses the full authenticated trade set rather than the current list page.',
            'Closed trades contribute full matched PnL minus recorded fees and slippage.',
            'Open and partially closed trades exclude unrealized mark-to-market.',
          ]).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </GlassPanel>
  );
}
