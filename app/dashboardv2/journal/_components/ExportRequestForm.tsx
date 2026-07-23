'use client';

import { FormEvent, useState } from 'react';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { downloadJournalExport } from '@/lib/journal/api';
import {
  buildJournalExportQuery,
  createInitialJournalExportFormValues,
  JournalExportFormValues,
} from '@/lib/journal/exports';

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export default function ExportRequestForm() {
  const [values, setValues] = useState<JournalExportFormValues>(() =>
    createInitialJournalExportFormValues(),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<Key extends keyof JournalExportFormValues>(
    field: Key,
    value: JournalExportFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
      ...(field === 'resource' && value === 'trades' ? { period: '' } : {}),
    }));

    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const validation = buildJournalExportQuery(values);

    if (!validation.success) {
      setFieldErrors(
        Object.fromEntries(
          Object.entries(validation.fieldErrors).map(([key, messages]) => [
            key,
            messages?.[0] ?? 'Invalid value.',
          ]),
        ),
      );
      setSubmitError('Check the export filters before downloading.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await downloadJournalExport(validation.data);
      triggerDownload(result.blob, result.fileName);
      setSuccessMessage(`Export downloaded: ${result.fileName}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Export download failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Exports"
          title="Download your journal data"
          description="Exports stay authenticated and user-scoped. Trades export trade-level rows only here, while reviews export the persisted normalized auto_stats snapshot."
          actions={<span className="status-chip">CSV + JSON</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        {submitError ? <div className="error-state">{submitError}</div> : null}
        {successMessage ? (
          <div className="success-state">{successMessage}</div>
        ) : null}

        <div className="journal-grid journal-grid-2">
          <label className="form-field">
            <span className="metric-label">Resource</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={values.resource}
              onChange={(event) =>
                updateField(
                  'resource',
                  event.target.value as JournalExportFormValues['resource'],
                )
              }
            >
              <option value="trades">trades</option>
              <option value="reviews">reviews</option>
            </select>
            {fieldErrors.resource ? (
              <span className="form-error">{fieldErrors.resource}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Format</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={values.format}
              onChange={(event) =>
                updateField(
                  'format',
                  event.target.value as JournalExportFormValues['format'],
                )
              }
            >
              <option value="csv">csv</option>
              <option value="json">json</option>
            </select>
            {fieldErrors.format ? (
              <span className="form-error">{fieldErrors.format}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">From</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="date"
              value={values.from}
              onChange={(event) => updateField('from', event.target.value)}
            />
            {fieldErrors.from ? (
              <span className="form-error">{fieldErrors.from}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">To</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="date"
              value={values.to}
              onChange={(event) => updateField('to', event.target.value)}
            />
            {fieldErrors.to ? (
              <span className="form-error">{fieldErrors.to}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Review period filter</span>
            <select
              className="journal-select"
              disabled={values.resource !== 'reviews' || isSubmitting}
              value={values.period}
              onChange={(event) =>
                updateField(
                  'period',
                  event.target.value as JournalExportFormValues['period'],
                )
              }
            >
              <option value="">all review periods</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
            <span className="table-secondary">
              Trades ignore this filter. Reviews use the persisted review period.
            </span>
            {fieldErrors.period ? (
              <span className="form-error">{fieldErrors.period}</span>
            ) : null}
          </label>
        </div>
      </GlassPanel>

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          onClick={() => {
            setValues(createInitialJournalExportFormValues());
            setFieldErrors({});
            setSubmitError(null);
            setSuccessMessage(null);
          }}
          type="button"
        >
          Reset
        </button>
        <button className="journal-button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Preparing export...' : 'Download export'}
        </button>
      </div>
    </form>
  );
}
