// global.d.ts
type GtagEventNames = 'config' | 'event' | 'set' | 'js' | 'consent';

type GtagConsentValue = 'granted' | 'denied';

interface GtagConsentParams {
  ad_storage?: GtagConsentValue;
  ad_user_data?: GtagConsentValue;
  ad_personalization?: GtagConsentValue;
  analytics_storage?: GtagConsentValue;
  wait_for_update?: number;
}

interface GtagConfig {
  page_path?: string;
  [key: string]: unknown; // for other GA config options
}

interface GtagEventParams {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: unknown;
}

interface Window {
  gtag: (command: GtagEventNames, ...args: Array<string | Date | GtagConfig | GtagEventParams | GtagConsentParams>) => void;
}
