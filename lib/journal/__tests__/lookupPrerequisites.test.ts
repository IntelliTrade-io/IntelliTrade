import { describe, expect, it } from 'vitest';

import { getTradeLookupPrerequisites } from '../lookupPrerequisites';

describe('getTradeLookupPrerequisites', () => {
  it('flags account and instrument blockers for trade creation', () => {
    const result = getTradeLookupPrerequisites(
      {
        accounts: [],
        instruments: [],
        strategies: [],
      },
      'create',
    );

    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toEqual([
      'No accounts are available for this user. Create or seed at least one account before adding trades.',
      'No instruments are available for this user. Create or seed at least one instrument before adding trades.',
    ]);
    expect(result.notes).toEqual([
      'No strategies are available yet. Strategy is optional and the field can be left blank.',
    ]);
  });

  it('uses edit-specific blocker copy when lookups disappear for trade editing', () => {
    const result = getTradeLookupPrerequisites(
      {
        accounts: [],
        instruments: [{ id: 'instrument-1', label: 'EURUSD' }],
        strategies: [],
      },
      'edit',
    );

    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toEqual([
      'This trade cannot be reassigned until at least one account is available to the current user.',
    ]);
  });
});
