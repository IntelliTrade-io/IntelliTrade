import {
  JournalExportDocument,
  JournalExportFormat,
  JournalExportResource,
  JournalReviewExportRow,
  JournalReviewPeriod,
  JournalTradeExportRow,
} from '@/lib/journal/types';
import { JournalExportQuery, JournalExportQuerySchema } from '@/lib/journal/validation';

export type JournalExportFormValues = {
  resource: JournalExportResource;
  format: JournalExportFormat;
  from: string;
  to: string;
  period: JournalReviewPeriod | '';
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function escapeCsvValue(value: unknown) {
  const normalized =
    value == null
      ? ''
      : Array.isArray(value)
        ? value.join(' | ')
        : String(value);

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildCsv<T extends Record<string, unknown>>(
  columns: Array<keyof T>,
  rows: T[],
) {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column])).join(','),
  );

  return [header, ...lines].join('\n');
}

export function createInitialJournalExportFormValues(): JournalExportFormValues {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    resource: 'trades',
    format: 'csv',
    from: formatDateInput(startOfMonth),
    to: formatDateInput(today),
    period: '',
  };
}

export function buildJournalExportQuery(values: JournalExportFormValues) {
  const normalizedInput = {
    resource: values.resource,
    format: values.format,
    from: values.from.trim(),
    to: values.to.trim(),
    period: values.resource === 'reviews' ? values.period || null : null,
  };
  const result = JournalExportQuerySchema.safeParse(normalizedInput);

  if (!result.success) {
    return {
      success: false as const,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  return {
    success: true as const,
    data: result.data,
  };
}

export function buildJournalExportSearchParams(query: JournalExportQuery) {
  const searchParams = new URLSearchParams({
    resource: query.resource,
    format: query.format,
    from: query.from,
    to: query.to,
  });

  if (query.period) {
    searchParams.set('period', query.period);
  }

  return searchParams;
}

export function buildJournalExportFileName(query: JournalExportQuery) {
  const periodPart =
    query.resource === 'reviews' && query.period ? `-${query.period}` : '';

  return `journal-${query.resource}${periodPart}-${query.from}-to-${query.to}.${query.format}`;
}

export function readDownloadFileName(
  contentDisposition: string | null,
  fallback: string,
) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

export function serializeTradeExportCsv(rows: JournalTradeExportRow[]) {
  return buildCsv<JournalTradeExportRow>(
    [
      'trade_id',
      'opened_at',
      'closed_at',
      'account',
      'broker',
      'symbol',
      'asset_class',
      'strategy',
      'setup',
      'thesis',
      'bias',
      'resolution',
      'qty',
      'avg_entry',
      'avg_exit',
      'pnl_net',
      'r',
      'risk_per_trade',
      'target_r',
      'fees_total',
      'slippage_total',
      'tags',
    ],
    rows,
  );
}

export function serializeReviewExportCsv(rows: JournalReviewExportRow[]) {
  return buildCsv<JournalReviewExportRow>(
    [
      'review_id',
      'period',
      'period_start',
      'period_end',
      'notes',
      'created_at',
      'snapshot_completeness',
      'total_trades',
      'closed_trades',
      'open_trades',
      'partially_closed_trades',
      'net_pnl_closed',
      'avg_r_closed_or_resolved',
      'unsupported_keys',
      'snapshot_notes',
    ],
    rows,
  );
}

export function serializeJournalExportDocument(document: JournalExportDocument) {
  return JSON.stringify(document, null, 2);
}
