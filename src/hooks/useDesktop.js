import { useState, useEffect } from 'react';

const MQ = '(min-width: 1024px)';

export function useDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}
