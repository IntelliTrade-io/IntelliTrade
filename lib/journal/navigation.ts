export type JournalNavItem = {
  id: string;
  part: string;
  title: string;
  href: string;
};

export const journalSectionNavItems: JournalNavItem[] = [
  { id: 'overview', part: '01', title: 'Overview', href: '#overview' },
  { id: 'performance', part: '02', title: 'Performance', href: '#performance' },
  { id: 'trades', part: '03', title: 'Trades', href: '#trades' },
  { id: 'roadmap', part: '04', title: 'Rollout', href: '#roadmap' },
];

export const journalRouteNavItems: JournalNavItem[] = [
  { id: 'journal-home', part: '01', title: 'Journal home', href: '/dashboardv2/journal' },
  { id: 'setup', part: '02', title: 'Setup', href: '/dashboardv2/journal/setup' },
  { id: 'trade-new', part: '03', title: 'Add trade', href: '/dashboardv2/journal/trades/new' },
  { id: 'reviews', part: '04', title: 'Reviews', href: '/dashboardv2/journal/reviews' },
  { id: 'exports', part: '05', title: 'Exports', href: '/dashboardv2/journal/exports' },
];
