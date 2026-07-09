'use client'; // important! makes this a client component

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { pageview } from '@/lib/gtag';

export default function GATracker() {
  const pathname = usePathname(); // gives current path

  useEffect(() => {
    pageview(pathname); // send pageview to GA
  }, [pathname]);

  return null; // this component renders nothing visually
}
