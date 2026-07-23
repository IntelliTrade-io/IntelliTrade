import { createClient } from '@supabase/supabase-js';

import { createJournalDemoFixtures } from '../components/dashboardv2/generated/journalFixtures';

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function runStep(label: string, task: () => Promise<{ error: { message: string } | null }>) {
  const { error } = await task();
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    throw new Error('Usage: npx tsx scripts/seed-journal-demo.ts <auth-user-id>');
  }

  const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const fixtures = createJournalDemoFixtures(userId);
  const tradeIds = fixtures.trades.map((trade) => trade.id);

  await runStep('Upserting accounts', async () => await supabase.from('accounts').upsert(fixtures.accounts, { onConflict: 'id' }));
  await runStep('Upserting instruments', async () =>
    await supabase.from('instruments').upsert(fixtures.instruments, { onConflict: 'id' }),
  );
  await runStep('Upserting strategies', async () =>
    await supabase.from('strategies').upsert(fixtures.strategies, { onConflict: 'id' }),
  );
  await runStep('Upserting trades', async () => await supabase.from('trades').upsert(fixtures.trades, { onConflict: 'id' }));
  await runStep('Resetting trade legs', async () => await supabase.from('trade_legs').delete().in('trade_id', tradeIds));
  await runStep('Inserting trade legs', async () => await supabase.from('trade_legs').insert(fixtures.tradeLegs));
  await runStep('Upserting reviews', async () => await supabase.from('reviews').upsert(fixtures.reviews, { onConflict: 'id' }));

  console.log(`Seeded IntelliJournal demo data for user ${userId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
