'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useState } from 'react';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { saveReview } from '@/lib/journal/api';
import {
  buildReviewSavePayload,
  ReviewSaveFormValues,
} from '@/lib/journal/normalization';
import { JournalReviewRecord } from '@/lib/journal/types';

type ReviewSaveFormProps = {
  reviews: JournalReviewRecord[];
};

type EditableReview = Pick<
  JournalReviewRecord,
  'id' | 'period' | 'period_start' | 'period_end' | 'notes'
>;

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createDefaultValues(): ReviewSaveFormValues {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const distanceFromMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - distanceFromMonday);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return {
    period: 'weekly',
    period_start: formatDateInput(startOfWeek),
    period_end: formatDateInput(endOfWeek),
    notes: '',
  };
}

function toEditableReview(review: JournalReviewRecord): EditableReview {
  return {
    id: review.id,
    period: review.period,
    period_start: review.period_start,
    period_end: review.period_end,
    notes: review.notes,
  };
}

export default function ReviewSaveForm({ reviews }: ReviewSaveFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ReviewSaveFormValues>(() =>
    createDefaultValues(),
  );
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<Key extends keyof ReviewSaveFormValues>(
    field: Key,
    value: ReviewSaveFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));

    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function handleExistingReviewChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.target.value;
    setSelectedReviewId(nextId);
    setSubmitError(null);
    setSuccessMessage(null);

    if (!nextId) {
      setValues(createDefaultValues());
      return;
    }

    const selectedReview = reviews
      .map(toEditableReview)
      .find((review) => review.id === nextId);

    if (!selectedReview) {
      return;
    }

    setValues({
      period: selectedReview.period,
      period_start: selectedReview.period_start,
      period_end: selectedReview.period_end,
      notes: selectedReview.notes ?? '',
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const validation = buildReviewSavePayload(values);

    if (!validation.success) {
      setFieldErrors(
        Object.fromEntries(
          Object.entries(validation.fieldErrors).map(([key, messages]) => [
            key,
            messages?.[0] ?? 'Invalid value.',
          ]),
        ),
      );
      setSubmitError('Check the review period and notes fields.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await saveReview(validation.data);
      setSuccessMessage(
        result.action === 'created'
          ? 'Review saved for this period.'
          : 'Existing review updated for this period.',
      );
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Review save failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Review write flow"
          title="Save or update a review"
          description="Saving the same period and period start updates the existing review rather than creating a duplicate. The persisted snapshot uses only the current realized-stats foundation."
          actions={<span className="status-chip">Protected review save</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        {submitError ? <div className="error-state">{submitError}</div> : null}
        {successMessage ? <div className="success-state">{successMessage}</div> : null}

        <div className="journal-grid journal-grid-2">
          <label className="form-field form-field-full">
            <span className="metric-label">Load existing review</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={selectedReviewId}
              onChange={handleExistingReviewChange}
            >
              <option value="">Start a new review draft</option>
              {reviews.map((review) => (
                <option key={review.id} value={review.id}>
                  {review.period} | {review.period_start} to {review.period_end}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="metric-label">Period</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={values.period}
              onChange={(event) =>
                updateField('period', event.target.value as ReviewSaveFormValues['period'])
              }
            >
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
            {fieldErrors.period ? <span className="form-error">{fieldErrors.period}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Period start</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="date"
              value={values.period_start}
              onChange={(event) => updateField('period_start', event.target.value)}
            />
            {fieldErrors.period_start ? (
              <span className="form-error">{fieldErrors.period_start}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Period end</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="date"
              value={values.period_end}
              onChange={(event) => updateField('period_end', event.target.value)}
            />
            {fieldErrors.period_end ? (
              <span className="form-error">{fieldErrors.period_end}</span>
            ) : null}
          </label>

          <label className="form-field form-field-full">
            <span className="metric-label">Notes</span>
            <textarea
              className="journal-textarea"
              disabled={isSubmitting}
              rows={5}
              value={values.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="What improved, what slipped, and what needs correcting next period."
            />
            {fieldErrors.notes ? <span className="form-error">{fieldErrors.notes}</span> : null}
          </label>
        </div>
      </GlassPanel>

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          onClick={() => {
            setSelectedReviewId('');
            setValues(createDefaultValues());
            setFieldErrors({});
            setSubmitError(null);
            setSuccessMessage(null);
          }}
          type="button"
        >
          Reset
        </button>
        <button className="journal-button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving review...' : 'Save review'}
        </button>
      </div>
    </form>
  );
}
