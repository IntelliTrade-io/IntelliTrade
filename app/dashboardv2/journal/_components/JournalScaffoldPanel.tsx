import Link from 'next/link';

import GlassPanel from '@/components/journal/ui/GlassPanel';
import SectionHeader from '@/components/journal/ui/SectionHeader';

type JournalScaffoldPanelProps = {
  kicker: string;
  title: string;
  description: string;
  items: string[];
  actionHref?: string;
  actionLabel?: string;
};

export default function JournalScaffoldPanel({
  actionHref,
  actionLabel,
  description,
  items,
  kicker,
  title,
}: JournalScaffoldPanelProps) {
  return (
    <GlassPanel as="section">
      <SectionHeader
        kicker={kicker}
        title={title}
        description={description}
        actions={
          actionHref && actionLabel ? (
            <Link className="journal-button" href={actionHref}>
              {actionLabel}
            </Link>
          ) : undefined
        }
      />

      <div className="surface-divider" style={{ margin: '20px 0' }} />

      <div className="foundation-card">
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </GlassPanel>
  );
}
