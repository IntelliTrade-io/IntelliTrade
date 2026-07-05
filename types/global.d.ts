// global.d.ts
type GtagEventNames = 'config' | 'event' | 'set' | 'js';

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
  gtag: (command: GtagEventNames, ...args: Array<string | Date | GtagConfig | GtagEventParams>) => void;
}
