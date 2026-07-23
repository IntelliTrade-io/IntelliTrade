'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { replaceTradeLegs } from '@/lib/journal/api';
import {
  buildReplaceTradeLegsPayload,
  createEmptyEditableTradeLeg,
  createInitialTradeLegEditFormValues,
  TradeLegEditFormValues,
} from '@/lib/journal/normalization';
import { TradeLegRow } from '@/lib/journal/types';

type TradeLegEditFormProps = {
  tradeId: string;
  legs: TradeLegRow[];
  openedAt: string;
};

export default function TradeLegEditForm({
  tradeId,
  legs,
  openedAt,
}: TradeLegEditFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<TradeLegEditFormValues>(() =>
    createInitialTradeLegEditFormValues(legs),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateLegField(
    index: number,
    field: keyof TradeLegEditFormValues['legs'][number],
    value: string,
  ) {
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
      delete nextErrors.legs;
      return nextErrors;
    });
  }

  function addLeg() {
    setValues((currentValues) => ({
      ...currentValues,
      legs: [...currentValues.legs, createEmptyEditableTradeLeg(openedAt)],
    }));
  }

  function removeLeg(index: number) {
    setValues((currentValues) => ({
      ...currentValues,
      legs: currentValues.legs.filter((_, legIndex) => legIndex !== index),
    }));

    setFieldErrors((currentErrors) =>
      Object.fromEntries(
        Object.entries(currentErrors).filter(([key]) => !key.startsWith('legs.')),
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const validation = buildReplaceTradeLegsPayload(values);

    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError('Check the execution legs before saving the replacement set.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await replaceTradeLegs(tradeId, validation.data);
      setSuccessMessage(
        result.leg_count === 1
          ? 'Execution legs replaced with 1 leg.'
          : `Execution legs replaced with ${result.leg_count} legs.`,
      );
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Execution leg update failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <div className="foundation-card">
        <p className="subtle-copy">
          This editor replaces the full execution-leg set in one save. It is a
          narrow controlled workflow, not a full trade-reconstruction history
          tool.
        </p>
        <p className="subtle-copy">
          If replacement fails after the existing legs are cleared, the route
          attempts to restore the prior legs before returning an error.
        </p>
      </div>

      {submitError ? <div className="error-state">{submitError}</div> : null}
      {successMessage ? <div className="success-state">{successMessage}</div> : null}
      {fieldErrors.legs ? <div className="error-state">{fieldErrors.legs}</div> : null}

      <div className="journal-grid">
        {values.legs.map((leg, index) => (
          <div key={leg.client_id} className="leg-card">
            <div className="leg-card-header">
              <span className="metric-label">Leg {index + 1}</span>
              <button
                className="journal-button"
                disabled={values.legs.length === 1 || isSubmitting}
                type="button"
                onClick={() => removeLeg(index)}
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
                  onChange={(event) =>
                    updateLegField(index, 'side', event.target.value)
                  }
                >
                  <option value="buy">buy</option>
                  <option value="sell">sell</option>
                </select>
                {fieldErrors[`legs.${index}.side`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.side`]}
                  </span>
                ) : null}
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
                  onChange={(event) =>
                    updateLegField(index, 'qty', event.target.value)
                  }
                  placeholder="1"
                />
                {fieldErrors[`legs.${index}.qty`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.qty`]}
                  </span>
                ) : null}
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
                  onChange={(event) =>
                    updateLegField(index, 'price', event.target.value)
                  }
                  placeholder="1.0832"
                />
                {fieldErrors[`legs.${index}.price`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.price`]}
                  </span>
                ) : null}
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
                  onChange={(event) =>
                    updateLegField(index, 'fee', event.target.value)
                  }
                  placeholder="0"
                />
                {fieldErrors[`legs.${index}.fee`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.fee`]}
                  </span>
                ) : null}
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
                  onChange={(event) =>
                    updateLegField(index, 'slippage', event.target.value)
                  }
                  placeholder="0"
                />
                {fieldErrors[`legs.${index}.slippage`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.slippage`]}
                  </span>
                ) : null}
              </label>

              <label className="form-field">
                <span className="metric-label">Executed at</span>
                <input
                  className="journal-input"
                  disabled={isSubmitting}
                  type="datetime-local"
                  value={leg.executed_at}
                  onChange={(event) =>
                    updateLegField(index, 'executed_at', event.target.value)
                  }
                />
                {fieldErrors[`legs.${index}.executed_at`] ? (
                  <span className="form-error">
                    {fieldErrors[`legs.${index}.executed_at`]}
                  </span>
                ) : null}
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            setValues(createInitialTradeLegEditFormValues(legs));
            setFieldErrors({});
            setSubmitError(null);
            setSuccessMessage(null);
          }}
        >
          Reset legs
        </button>
        <button
          className="journal-button"
          disabled={isSubmitting}
          type="button"
          onClick={addLeg}
        >
          Add leg
        </button>
        <button
          className="journal-button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving legs...' : 'Replace legs'}
        </button>
      </div>
    </form>
  );
}
