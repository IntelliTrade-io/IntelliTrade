export const JOURNAL_SCREENSHOTS_BUCKET = 'journal-screenshots';
export const MAX_SCREENSHOT_SIZE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_SCREENSHOT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export type ScreenshotCandidate = {
  name: string;
  type: string;
  size: number;
};

export function validateScreenshotCandidate(file: ScreenshotCandidate) {
  const errors: string[] = [];

  if (file.size <= 0) {
    errors.push('Screenshot files must not be empty.');
  }

  if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
    errors.push('Only PNG, JPEG, and WebP screenshots are currently allowed.');
  }

  if (file.size > MAX_SCREENSHOT_SIZE_BYTES) {
    errors.push('Screenshot exceeds the 8 MB upload limit.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeScreenshotFileName(fileName: string) {
  const cleaned = fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'chart-screenshot';
}

export function buildTradeScreenshotPath(input: {
  userId: string;
  tradeId: string;
  fileName: string;
  timestamp?: number;
}) {
  const timestamp = input.timestamp ?? Date.now();
  return `journal/${input.userId}/trades/${input.tradeId}/${timestamp}-${sanitizeScreenshotFileName(input.fileName)}`;
}

export function mergeTradeScreenshotPaths(
  existingPaths: string[] | null | undefined,
  newPaths: string[],
) {
  return Array.from(new Set([...(existingPaths ?? []), ...newPaths]));
}
