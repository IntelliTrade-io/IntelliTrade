/* eslint-disable @typescript-eslint/no-explicit-any */
// global.d.ts
type GtagEventNames = 'config' | 'event' | 'set' | 'js';

interface GtagConfig {
  page_path?: string;
  [key: string]: any; // for other GA config options
}

interface GtagEventParams {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: any;
}

interface Window {
  gtag: (command: GtagEventNames, ...args: any[]) => void;
}
