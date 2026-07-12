export const GA_TRACKING_ID = 'G-EX1XMJTN0S';

// Log pageviews. Guarded: gtag.js only loads in production (see app/layout.tsx),
// so in dev window.gtag is undefined and this must no-op instead of throwing.
export const pageview = (url: string) => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('config', GA_TRACKING_ID, { page_path: url });
};

// Log specific events
export const event = ({
  action,
  category,
  label,
  value,
}: {
  action: string;
  category: string;
  label?: string;
  value?: number;
}) => {
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value,
  });
};
