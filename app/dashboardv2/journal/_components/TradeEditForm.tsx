'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { updateTrade } from '@/lib/journal/api';
import { getTradeLookupPrerequisites } from '@/lib/journal/lookupPrerequisites';
import {
  buildUpdateTradePayload,
  createInitialUpdateTradeFormValues,
  UpdateTradeFormValues,
} from '@/lib/journal/normalization';
import { JournalTradeFormLookups, TradeDetailResponse } from '@/lib/journal/types';

type TradeEditFormProps = {
  trade: Pick<
    TradeDetailResponse,
    | 'id'
    | 'account_id'
    | 'instrument_id'
    | 'strategy_id'
    | 'setup'
    | 'bias'
    | 'thesis'
    | 'risk_per_trade'
    | 'target_r'
    | 'tags'
    | 'opened_at'
  >;
  lookups: JournalTradeFormLookups | null;
  lookupsError?: string | null;
};

export default function TradeEditForm({
  trade,
  lookups,
  lookupsError = null,
}: TradeEditFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<UpdateTradeFormValues>(() =>
    createInitialUpdateTradeFormValues(trade),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prerequisiteState = lookups
    ? getTradeLookupPrerequisites(lookups, 'edit')
    : { blockers: [] as string[], notes: [] as string[], canSubmit: false };
  const missingRequirements = prerequisiteState.blockers;

  const canSubmit =
    !isSubmitting &&
    !lookupsError &&
    lookups != null &&
    prerequisiteState.canSubmit;

  function updateField<Key extends keyof UpdateTradeFormValues>(
    field: Key,
    value: UpdateTradeFormValues[Key],
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const validation = buildUpdateTradePayload(values);

    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError('Check the highlighted trade fields before saving.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await updateTrade(trade.id, validation.data);
      setSuccessMessage('Trade details saved.');
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Trade update failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <GlassPanel as="section">
        <SectionHeader
          kicker="Edit trade"
          title="Update top-level trade fields"
          description="This form only edits supported top-level trade fields. Execution legs are maintained in the dedicated execution section below, and screenshots continue through the dedicated screenshot upload route."
          actions={<span className="status-chip">Top-level fields only</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        {lookupsError ? <div className="error-state">{lookupsError}</div> : null}

        {missingRequirements.length > 0 ? (
          <div className="error-state">
            {missingRequirements.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        ) : null}

        {prerequisiteState.notes.length > 0 ? (
          <div className="warning-state">
            {prerequisiteState.notes.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        ) : null}

        {submitError ? <div className="error-state">{submitError}</div> : null}
        {successMessage ? (
          <div className="success-state">{successMessage}</div>
        ) : null}

        <div className="journal-grid journal-grid-2">
          <label className="form-field">
            <span className="metric-label">Account</span>
            <select
              className="journal-select"
              disabled={!canSubmit}
              value={values.account_id}
              onChange={(event) => updateField('account_id', event.target.value)}
            >
              <option value="">Select account</option>
              {(lookups?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            {fieldErrors.account_id ? (
              <span className="form-error">{fieldErrors.account_id}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Instrument</span>
            <select
              className="journal-select"
              disabled={!canSubmit}
              value={values.instrument_id}
              onChange={(event) =>
                updateField('instrument_id', event.target.value)
              }
            >
              <option value="">Select instrument</option>
              {(lookups?.instruments ?? []).map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.label}
                </option>
              ))}
            </select>
            {fieldErrors.instrument_id ? (
              <span className="form-error">{fieldErrors.instrument_id}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Strategy</span>
            <select
              className="journal-select"
              disabled={!canSubmit}
              value={values.strategy_id}
              onChange={(event) => updateField('strategy_id', event.target.value)}
            >
              <option value="">No strategy</option>
              {(lookups?.strategies ?? []).map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.label}
                </option>
              ))}
            </select>
            {fieldErrors.strategy_id ? (
              <span className="form-error">{fieldErrors.strategy_id}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Bias</span>
            <select
              className="journal-select"
              disabled={!canSubmit}
              value={values.bias}
              onChange={(event) =>
                updateField(
                  'bias',
                  event.target.value as UpdateTradeFormValues['bias'],
                )
              }
            >
              <option value="long">long</option>
              <option value="short">short</option>
            </select>
            {fieldErrors.bias ? (
              <span className="form-error">{fieldErrors.bias}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Opened at</span>
            <input
              className="journal-input"
              disabled={!canSubmit}
              type="datetime-local"
              value={values.opened_at}
              onChange={(event) => updateField('opened_at', event.target.value)}
            />
            {fieldErrors.opened_at ? (
              <span className="form-error">{fieldErrors.opened_at}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Setup</span>
            <input
              className="journal-input"
              disabled={!canSubmit}
              type="text"
              value={values.setup}
              onChange={(event) => updateField('setup', event.target.value)}
              placeholder="Compression break"
            />
            {fieldErrors.setup ? (
              <span className="form-error">{fieldErrors.setup}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Risk per trade</span>
            <input
              className="journal-input"
              disabled={!canSubmit}
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={values.risk_per_trade}
              onChange={(event) =>
                updateField('risk_per_trade', event.target.value)
              }
              placeholder="150"
            />
            {fieldErrors.risk_per_trade ? (
              <span className="form-error">{fieldErrors.risk_per_trade}</span>
            ) : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Target R</span>
            <input
              className="journal-input"
              disabled={!canSubmit}
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={values.target_r}
              onChange={(event) => updateField('target_r', event.target.value)}
              placeholder="2.0"
            />
            {fieldErrors.target_r ? (
              <span className="form-error">{fieldErrors.target_r}</span>
            ) : null}
          </label>

          <label className="form-field form-field-full">
            <span className="metric-label">Tags</span>
            <input
              className="journal-input"
              disabled={!canSubmit}
              type="text"
              value={values.tags}
              onChange={(event) => updateField('tags', event.target.value)}
              placeholder="london, breakout, a-setup"
            />
            {fieldErrors.tags ? (
              <span className="form-error">{fieldErrors.tags}</span>
            ) : null}
          </label>

          <label className="form-field form-field-full">
            <span className="metric-label">Thesis</span>
            <textarea
              className="journal-textarea"
              disabled={!canSubmit}
              rows={4}
              value={values.thesis}
              onChange={(event) => updateField('thesis', event.target.value)}
              placeholder="Why this trade still holds or what changed."
            />
            {fieldErrors.thesis ? (
              <span className="form-error">{fieldErrors.thesis}</span>
            ) : null}
          </label>
        </div>
      </GlassPanel>

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            setValues(createInitialUpdateTradeFormValues(trade));
            setFieldErrors({});
            setSubmitError(null);
            setSuccessMessage(null);
          }}
        >
          Reset
        </button>
        <button
          className="journal-button-primary"
          disabled={!canSubmit}
          type="submit"
        >
          {isSubmitting ? 'Saving trade...' : 'Save trade'}
        </button>
      </div>
    </form>
  );
}
