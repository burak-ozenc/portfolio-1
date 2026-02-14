import { useState, useEffect, useCallback } from 'react';

export const useBlink = (isActive: boolean) => {
  const [shouldBlink, setShouldBlink] = useState(false);

  const triggerBlink = useCallback(() => {
    setShouldBlink(true);
    setTimeout(() => setShouldBlink(false), 150);
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const scheduleNextBlink = () => {
      // Random interval between 3-5 seconds
      const delay = 3000 + Math.random() * 2000;
      return setTimeout(triggerBlink, delay);
    };

    const timeoutId = scheduleNextBlink();

    return () => clearTimeout(timeoutId);
  }, [isActive, triggerBlink, shouldBlink]);

  return shouldBlink;
};
