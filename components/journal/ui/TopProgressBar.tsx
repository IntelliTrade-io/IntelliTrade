'use client';

import { useEffect, useState } from 'react';

export default function TopProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = totalHeight > 0 ? window.scrollY / totalHeight : 0;
      setProgress(Math.min(Math.max(nextProgress, 0), 1));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div aria-hidden className="top-progress-track">
      <div className="top-progress-bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
