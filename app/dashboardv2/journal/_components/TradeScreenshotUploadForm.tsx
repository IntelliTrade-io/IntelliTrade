'use client';

import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { uploadTradeScreenshots } from '@/lib/journal/api';
import {
  MAX_SCREENSHOT_SIZE_BYTES,
  validateScreenshotCandidate,
} from '@/lib/journal/uploads';

type TradeScreenshotUploadFormProps = {
  tradeId: string;
};

function formatMaxSize(sizeInBytes: number) {
  return `${Math.round(sizeInBytes / (1024 * 1024))} MB`;
}

export default function TradeScreenshotUploadForm({
  tradeId,
}: TradeScreenshotUploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    setFiles(nextFiles);
    setSubmitError(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (files.length === 0) {
      setSubmitError('Select at least one screenshot file to upload.');
      return;
    }

    for (const file of files) {
      const validation = validateScreenshotCandidate({
        name: file.name,
        type: file.type,
        size: file.size,
      });

      if (!validation.valid) {
        setSubmitError(validation.errors[0] ?? 'Screenshot file is invalid.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const result = await uploadTradeScreenshots(tradeId, files);
      setSuccessMessage(
        result.uploaded === 1
          ? '1 screenshot uploaded.'
          : `${result.uploaded} screenshots uploaded.`,
      );
      setFiles([]);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Screenshot upload failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="foundation-card" onSubmit={handleSubmit}>
      {submitError ? <div className="error-state">{submitError}</div> : null}
      {successMessage ? (
        <div className="success-state">{successMessage}</div>
      ) : null}

      <label className="form-field">
        <span className="metric-label">Select screenshots</span>
        <input
          ref={inputRef}
          accept="image/png,image/jpeg,image/webp"
          className="journal-input"
          disabled={isSubmitting}
          multiple
          type="file"
          onChange={handleFileChange}
        />
        <span className="table-secondary">
          PNG, JPEG, or WebP up to {formatMaxSize(MAX_SCREENSHOT_SIZE_BYTES)} each.
        </span>
      </label>

      {files.length > 0 ? (
        <div className="table-secondary">
          {files.length} file{files.length === 1 ? '' : 's'} selected.
        </div>
      ) : null}

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            setFiles([]);
            setSubmitError(null);
            setSuccessMessage(null);
            if (inputRef.current) {
              inputRef.current.value = '';
            }
          }}
        >
          Clear
        </button>
        <button
          className="journal-button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Uploading screenshots...' : 'Upload screenshots'}
        </button>
      </div>
    </form>
  );
}
