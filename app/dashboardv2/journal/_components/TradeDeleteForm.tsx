'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';
import { deleteTrade } from '@/lib/journal/api';

type TradeDeleteFormProps = {
  tradeId: string;
  screenshotCount: number;
};

export default function TradeDeleteForm({
  tradeId,
  screenshotCount,
}: TradeDeleteFormProps) {
  const router = useRouter();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!isConfirmed) {
      setSubmitError('Confirm the deletion before removing this trade.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await deleteTrade(tradeId);
      const searchParams = new URLSearchParams({ tradeDeleted: '1' });

      if (result.screenshot_cleanup === 'failed') {
        searchParams.set('tradeCleanup', 'storage-warning');
      }

      router.push(`/dashboardv2/journal?${searchParams.toString()}`);
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Trade delete failed.',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className="journal-grid" onSubmit={handleSubmit}>
      <GlassPanel as="section">
        <SectionHeader
          kicker="Delete trade"
          title="Permanent removal"
          description="This permanently deletes the trade row and its execution legs. Stored screenshot objects are then cleaned up with a best-effort storage removal step."
          actions={<span className="status-chip status-chip-negative">Delete flow</span>}
        />

        <div className="surface-divider" style={{ margin: '20px 0' }} />

        <div className="danger-card">
          <p>
            Screenshot references attached to this trade:{' '}
            <strong className="table-primary">{screenshotCount}</strong>
          </p>
          <p>
            Deletion removes the trade from the journal immediately. Screenshot
            storage cleanup runs after the trade row is deleted because storage
            and database operations are not atomic in this stack.
          </p>
        </div>

        {submitError ? <div className="error-state">{submitError}</div> : null}

        <label className="form-checkbox">
          <input
            checked={isConfirmed}
            disabled={isSubmitting}
            type="checkbox"
            onChange={(event) => setIsConfirmed(event.target.checked)}
          />
          <span>
            I understand this permanently deletes the trade, its execution
            legs, and the stored screenshot references associated with it.
          </span>
        </label>
      </GlassPanel>

      <div className="form-actions">
        <button
          className="journal-button"
          disabled={isSubmitting}
          type="button"
          onClick={() => router.push('/dashboardv2/journal')}
        >
          Cancel
        </button>
        <button
          className="journal-button-danger"
          disabled={isSubmitting || !isConfirmed}
          type="submit"
        >
          {isSubmitting ? 'Deleting trade...' : 'Delete trade'}
        </button>
      </div>
    </form>
  );
}
