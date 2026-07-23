'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { createTrade } from '@/lib/journal/api';
import {
  buildCreateTradePayload,
  createEmptyTradeLegDraft,
  createInitialTradeFormValues,
  CreateTradeFormValues,
} from '@/lib/journal/normalization';
import { getTradeLookupPrerequisites } from '@/lib/journal/lookupPrerequisites';
import { JournalTradeFormLookups } from '@/lib/journal/types';

type AddTradeFormProps = {
  lookups: JournalTradeFormLookups;
};

export default function AddTradeForm({ lookups }: AddTradeFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<CreateTradeFormValues>(() =>
    createInitialTradeFormValues({
      account_id: lookups.accounts[0]?.id,
      instrument_id: lookups.instruments[0]?.id,
      strategy_id: '',
    }),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prerequisiteState = getTradeLookupPrerequisites(lookups, 'create');
  const missingRequirements = prerequisiteState.blockers;

  const canSubmit = prerequisiteState.canSubmit && !isSubmitting;

  function updateField<Key extends keyof CreateTradeFormValues>(field: Key, value: CreateTradeFormValues[Key]) {
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

  function updateLegField(index: number, field: keyof CreateTradeFormValues['legs'][number], value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      legs: currentValues.legs.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: value,
            }
          : leg,
      ),
    }));

    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[`legs.${index}.${field}`];
      return nextErrors;
    });
  }

  function addLeg() {
    setValues((currentValues) => ({
      ...currentValues,
      legs: [...currentValues.legs, createEmptyTradeLegDraft(currentValues.opened_at)],
    }));
  }

  function removeLeg(index: number) {
    setValues((currentValues) => ({
      ...currentValues,
      legs: currentValues.legs.filter((_, legIndex) => legIndex !== index),
    }));

    setFieldErrors((currentErrors) =>
      Object.fromEntries(Object.entries(currentErrors).filter(([key]) => !key.startsWith('legs.'))),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const validation = buildCreateTradePayload(values);
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError('Check the highlighted trade fields and execution leg values.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await createTrade(validation.data);
      router.push('/dashboardv2/journal');
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Trade creation failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <GlassPanel as="section" tone="strong">
        <SectionHeader
          kicker="Add trade"
          title="New trade entry"
          description="This form writes to the protected journal create route. Screenshot upload happens later from trade detail, so screenshot_urls stays empty here."
          actions={<span className="status-chip">Protected create</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

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

        <div className="journal-grid journal-grid-2">
          <label className="form-field">
            <span className="metric-label">Account</span>
            <select
              className="journal-select"
              disabled={lookups.accounts.length === 0 || isSubmitting}
              value={values.account_id}
              onChange={(event) => updateField('account_id', event.target.value)}
            >
              <option value="">Select account</option>
              {lookups.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            {fieldErrors.account_id ? <span className="form-error">{fieldErrors.account_id}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Instrument</span>
            <select
              className="journal-select"
              disabled={lookups.instruments.length === 0 || isSubmitting}
              value={values.instrument_id}
              onChange={(event) => updateField('instrument_id', event.target.value)}
            >
              <option value="">Select instrument</option>
              {lookups.instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.label}
                </option>
              ))}
            </select>
            {fieldErrors.instrument_id ? <span className="form-error">{fieldErrors.instrument_id}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Strategy</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={values.strategy_id}
              onChange={(event) => updateField('strategy_id', event.target.value)}
            >
              <option value="">No strategy</option>
              {lookups.strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.label}
                </option>
              ))}
            </select>
            {fieldErrors.strategy_id ? <span className="form-error">{fieldErrors.strategy_id}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Bias</span>
            <select
              className="journal-select"
              disabled={isSubmitting}
              value={values.bias}
              onChange={(event) => updateField('bias', event.target.value as 'long' | 'short')}
            >
              <option value="long">long</option>
              <option value="short">short</option>
            </select>
            {fieldErrors.bias ? <span className="form-error">{fieldErrors.bias}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Opened at</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="datetime-local"
              value={values.opened_at}
              onChange={(event) => updateField('opened_at', event.target.value)}
            />
            {fieldErrors.opened_at ? <span className="form-error">{fieldErrors.opened_at}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Setup</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="text"
              value={values.setup}
              onChange={(event) => updateField('setup', event.target.value)}
              placeholder="Compression break"
            />
            {fieldErrors.setup ? <span className="form-error">{fieldErrors.setup}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Risk per trade</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={values.risk_per_trade}
              onChange={(event) => updateField('risk_per_trade', event.target.value)}
              placeholder="150"
            />
            {fieldErrors.risk_per_trade ? <span className="form-error">{fieldErrors.risk_per_trade}</span> : null}
          </label>

          <label className="form-field">
            <span className="metric-label">Target R</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={values.target_r}
              onChange={(event) => updateField('target_r', event.target.value)}
              placeholder="2.0"
            />
            {fieldErrors.target_r ? <span className="form-error">{fieldErrors.target_r}</span> : null}
          </label>

          <label className="form-field form-field-full">
            <span className="metric-label">Tags</span>
            <input
              className="journal-input"
              disabled={isSubmitting}
              type="text"
              value={values.tags}
              onChange={(event) => updateField('tags', event.target.value)}
              placeholder="london, breakout, a-setup"
            />
          </label>

          <label className="form-field form-field-full">
            <span className="metric-label">Thesis</span>
            <textarea
              className="journal-textarea"
              disabled={isSubmitting}
              rows={4}
              value={values.thesis}
              onChange={(event) => updateField('thesis', event.target.value)}
              placeholder="Why this trade exists, what invalidates it, and what session context matters."
            />
            {fieldErrors.thesis ? <span className="form-error">{fieldErrors.thesis}</span> : null}
          </label>
        </div>
      </GlassPanel>

      <GlassPanel as="section">
        <SectionHeader
          kicker="Execution legs"
          title="Leg editor"
          description="At least one execution leg is required. Legs are submitted directly to the existing authenticated create route."
          actions={
            <button className="journal-button" disabled={isSubmitting} onClick={addLeg} type="button">
              Add leg
            </button>
          }
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="journal-grid">
          {values.legs.map((leg, index) => (
            <div key={leg.client_id} className="leg-card">
              <div className="leg-card-header">
                <span className="metric-label">Leg {index + 1}</span>
                <button
                  className="journal-button"
                  disabled={values.legs.length === 1 || isSubmitting}
                  onClick={() => removeLeg(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <div className="leg-grid">
                <label className="form-field">
                  <span className="metric-label">Side</span>
                  <select
                    className="journal-select"
                    disabled={isSubmitting}
                    value={leg.side}
                    onChange={(event) => updateLegField(index, 'side', event.target.value)}
                  >
                    <option value="buy">buy</option>
                    <option value="sell">sell</option>
                  </select>
                  {fieldErrors[`legs.${index}.side`] ? <span className="form-error">{fieldErrors[`legs.${index}.side`]}</span> : null}
                </label>

                <label className="form-field">
                  <span className="metric-label">Qty</span>
                  <input
                    className="journal-input"
                    disabled={isSubmitting}
                    inputMode="decimal"
                    min="0"
                    step="0.000001"
                    type="number"
                    value={leg.qty}
                    onChange={(event) => updateLegField(index, 'qty', event.target.value)}
                    placeholder="1"
                  />
                  {fieldErrors[`legs.${index}.qty`] ? <span className="form-error">{fieldErrors[`legs.${index}.qty`]}</span> : null}
                </label>

                <label className="form-field">
                  <span className="metric-label">Price</span>
                  <input
                    className="journal-input"
                    disabled={isSubmitting}
                    inputMode="decimal"
                    min="0"
                    step="0.000001"
                    type="number"
                    value={leg.price}
                    onChange={(event) => updateLegField(index, 'price', event.target.value)}
                    placeholder="1.0832"
                  />
                  {fieldErrors[`legs.${index}.price`] ? <span className="form-error">{fieldErrors[`legs.${index}.price`]}</span> : null}
                </label>

                <label className="form-field">
                  <span className="metric-label">Fee</span>
                  <input
                    className="journal-input"
                    disabled={isSubmitting}
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    type="number"
                    value={leg.fee}
                    onChange={(event) => updateLegField(index, 'fee', event.target.value)}
                    placeholder="0"
                  />
                  {fieldErrors[`legs.${index}.fee`] ? <span className="form-error">{fieldErrors[`legs.${index}.fee`]}</span> : null}
                </label>

                <label className="form-field">
                  <span className="metric-label">Slippage</span>
                  <input
                    className="journal-input"
                    disabled={isSubmitting}
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    type="number"
                    value={leg.slippage}
                    onChange={(event) => updateLegField(index, 'slippage', event.target.value)}
                    placeholder="0"
                  />
                  {fieldErrors[`legs.${index}.slippage`] ? (
                    <span className="form-error">{fieldErrors[`legs.${index}.slippage`]}</span>
                  ) : null}
                </label>

                <label className="form-field">
                  <span className="metric-label">Executed at</span>
                  <input
                    className="journal-input"
                    disabled={isSubmitting}
                    type="datetime-local"
                    value={leg.executed_at}
                    onChange={(event) => updateLegField(index, 'executed_at', event.target.value)}
                  />
                  {fieldErrors[`legs.${index}.executed_at`] ? (
                    <span className="form-error">{fieldErrors[`legs.${index}.executed_at`]}</span>
                  ) : null}
                </label>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <div className="form-actions">
        <button className="journal-button" disabled={isSubmitting} onClick={() => router.push('/dashboardv2/journal')} type="button">
          Cancel
        </button>
        <button className="journal-button-primary" disabled={!canSubmit} type="submit">
          {isSubmitting ? 'Saving trade...' : 'Create trade'}
        </button>
      </div>
    </form>
  );
}
