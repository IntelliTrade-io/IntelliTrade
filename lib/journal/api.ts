import {
  buildJournalExportFileName,
  buildJournalExportSearchParams,
  readDownloadFileName,
} from '@/lib/journal/exports';
import { CreateTrade } from '@/lib/journal/validation';
import {
  JournalCreateTradeResponse,
  JournalDeleteTradeResponse,
  JournalDashboardStats,
  JournalListResponse,
  JournalReplaceTradeLegsResponse,
  JournalSaveReviewResponse,
  JournalTradeScreenshotUploadResponse,
  JournalUpdateTradeResponse,
  TradeDetailResponse,
} from '@/lib/journal/types';
import {
  JournalExportQuery,
  ReplaceTradeLegs,
  ReviewSave,
  UpdateTrade,
} from '@/lib/journal/validation';

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication required to load journal data.');
    }

    if (res.status === 403) {
      throw new Error('You do not have access to this journal resource.');
    }

    throw new Error(`Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export function getJournalList(page = 1, limit = 50) {
  return readJson<JournalListResponse>(`/api/journal?page=${page}&limit=${limit}`);
}

export function getJournalStats() {
  return readJson<JournalDashboardStats>('/api/journal/stats');
}

export function getTradeDetail(id: string) {
  return readJson<TradeDetailResponse>(`/api/journal/${id}`);
}

export async function createTrade(payload: CreateTrade) {
  const res = await fetch('/api/journal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to create trades for the selected resources.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalCreateTradeResponse;
}

export async function saveReview(payload: ReviewSave) {
  const res = await fetch('/api/journal/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to save this review.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalSaveReviewResponse;
}

export async function updateTrade(tradeId: string, payload: UpdateTrade) {
  const res = await fetch(`/api/journal/${tradeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to update this trade.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalUpdateTradeResponse;
}

export async function deleteTrade(tradeId: string) {
  const res = await fetch(`/api/journal/${tradeId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to delete this trade.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalDeleteTradeResponse;
}

export async function replaceTradeLegs(
  tradeId: string,
  payload: ReplaceTradeLegs,
) {
  const res = await fetch(`/api/journal/${tradeId}/legs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to update legs for this trade.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalReplaceTradeLegsResponse;
}

export async function downloadJournalExport(query: JournalExportQuery) {
  const res = await fetch(
    `/api/journal/exports?${buildJournalExportSearchParams(query).toString()}`,
    {
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to export this journal data.');
    }

    throw new Error(errorMessage);
  }

  const fallbackFileName = buildJournalExportFileName(query);

  return {
    blob: await res.blob(),
    fileName: readDownloadFileName(
      res.headers.get('Content-Disposition'),
      fallbackFileName,
    ),
  };
}

export async function uploadTradeScreenshots(tradeId: string, files: File[]) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('screenshots', file);
  }

  const res = await fetch(`/api/journal/${tradeId}/screenshots`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;

    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the fallback message when the error response is not JSON.
    }

    if (res.status === 401) {
      throw new Error('Your session is no longer valid. Sign in again and retry.');
    }

    if (res.status === 403) {
      throw new Error('You do not have permission to upload screenshots for this trade.');
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as JournalTradeScreenshotUploadResponse;
}
