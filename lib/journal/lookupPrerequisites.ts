import { JournalTradeFormLookups } from '@/lib/journal/types';

type TradeLookupMode = 'create' | 'edit';

export function getTradeLookupPrerequisites(
  lookups: JournalTradeFormLookups,
  mode: TradeLookupMode,
) {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (lookups.accounts.length === 0) {
    blockers.push(
      mode === 'create'
        ? 'No accounts are available for this user. Create or seed at least one account before adding trades.'
        : 'This trade cannot be reassigned until at least one account is available to the current user.',
    );
  }

  if (lookups.instruments.length === 0) {
    blockers.push(
      mode === 'create'
        ? 'No instruments are available for this user. Create or seed at least one instrument before adding trades.'
        : 'This trade cannot be reassigned until at least one instrument is available to the current user.',
    );
  }

  if (lookups.strategies.length === 0) {
    notes.push(
      'No strategies are available yet. Strategy is optional and the field can be left blank.',
    );
  }

  return {
    blockers,
    notes,
    canSubmit: blockers.length === 0,
  };
}
