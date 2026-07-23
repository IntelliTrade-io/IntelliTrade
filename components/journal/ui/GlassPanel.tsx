import clsx from 'clsx';
import { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  bodyClassName?: string;
  tone?: 'default' | 'strong';
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

export default function GlassPanel<T extends ElementType = 'section'>({
  as,
  bodyClassName,
  children,
  className,
  tone = 'default',
  ...props
}: GlassPanelProps<T>) {
  const Component = as ?? 'section';

  return (
    <Component className={clsx('glass-panel', tone === 'strong' && 'glass-panel-strong', className)} {...props}>
      <div className={clsx('glass-panel-body', bodyClassName)}>{children}</div>
    </Component>
  );
}
