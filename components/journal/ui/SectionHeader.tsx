import { ReactNode } from 'react';

type SectionHeaderProps = {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export default function SectionHeader({ actions, description, kicker, title }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header-copy">
        {kicker ? <div className="accent-pill">{kicker}</div> : null}
        <h2 className="section-header-title">{title}</h2>
        {description ? <p className="section-header-description">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
