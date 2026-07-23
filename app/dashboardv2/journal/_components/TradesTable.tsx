'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { getJournalList } from '@/lib/journal/api';
import { JournalListResponse, TradeRow } from '@/lib/journal/types';

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(2);
}

export default function TradesTable() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useQuery<JournalListResponse>({
    queryKey: ['trades', page],
    queryFn: () => getJournalList(page),
  });
  const rows: TradeRow[] = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 };

  useEffect(() => {
    if (page > pagination.pages) {
      setPage(pagination.pages);
    }
  }, [page, pagination.pages]);

  const columns = useMemo<ColumnDef<TradeRow>[]>(
    () => [
      {
        header: 'Date',
        accessorKey: 'opened_at',
        cell: (info) => (
          <div>
            <div className="table-primary">{new Date(info.getValue<string>()).toLocaleDateString()}</div>
            <div className="table-secondary">
              {new Date(info.getValue<string>()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ),
      },
      {
        header: 'Symbol',
        accessorKey: 'symbol',
        cell: (info) => (
          <Link className="table-primary" href={`/dashboardv2/journal/trades/${info.row.original.id}`}>
            {info.getValue<string | null>() ?? 'Unknown'}
          </Link>
        ),
      },
      {
        header: 'Side',
        accessorKey: 'side',
        cell: (info) => (
          <span
            className={`status-chip ${info.getValue<'long' | 'short'>() === 'long' ? 'status-chip-positive' : 'status-chip-negative'}`}
          >
            {info.getValue<'long' | 'short'>()}
          </span>
        ),
      },
      { header: 'Qty', accessorKey: 'qty', cell: (info) => formatNumber(info.getValue<number>()) },
      { header: 'Avg Entry', accessorKey: 'avg_entry', cell: (info) => formatNumber(info.getValue<number | null>()) },
      { header: 'Avg Exit', accessorKey: 'avg_exit', cell: (info) => formatNumber(info.getValue<number | null>()) },
      {
        header: 'PnL (net)',
        accessorKey: 'pnl_net',
        cell: (info) => (
          <span className={info.getValue<number>() >= 0 ? 'metric-value-positive' : 'metric-value-negative'}>
            {formatCurrency(info.getValue<number>())}
          </span>
        ),
      },
      {
        header: 'R',
        accessorKey: 'r',
        cell: (info) => {
          const value = info.getValue<number | null>();
          return value == null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
        },
      },
      {
        header: 'Strategy',
        accessorKey: 'strategy',
        cell: (info) =>
          info.getValue<string | null>() ? <span className="table-chip">{info.getValue<string>()}</span> : '--',
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <GlassPanel as="section">
      <SectionHeader
        kicker="Trades"
        title="Recent executions"
        description="Authenticated trades load here with direct access to detail, top-level editing, leg replacement, screenshots, and safe delete controls."
        actions={
          <Link className="journal-button-primary" href="/dashboardv2/journal/trades/new">
            Add trade
          </Link>
        }
      />

      <div className="surface-divider" style={{ margin: '20px 0' }} />

      <div className="table-shell">
        <div className="table-scroll">
          <table className="journal-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="empty-state" colSpan={columns.length}>
                    Loading trades...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="error-state" colSpan={columns.length}>
                    {error.message}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="empty-state" colSpan={columns.length}>
                    No trades have been recorded yet. Use Add trade to create
                    the first journal entry.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pagination-row">
        <div className="pagination-meta">
          Page {pagination.page} of {pagination.pages} | {pagination.total} total trades
        </div>
        <div className="pagination-actions">
          <button
            className="journal-button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className="journal-button"
            disabled={page >= pagination.pages}
            onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
