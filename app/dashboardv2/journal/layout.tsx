import { PropsWithChildren } from 'react';

import { redirect } from 'next/navigation';

import { requireAuthenticatedUser } from '@/lib/supabase/server';

import { JournalProviders } from './providers';
import './journal.css';

export default async function JournalLayout({ children }: PropsWithChildren) {
  const { supabase, user } = await requireAuthenticatedUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent('/dashboardv2/journal')}`);
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
    redirect('/upgrade');
  }

  return <JournalProviders>{children}</JournalProviders>;
}
