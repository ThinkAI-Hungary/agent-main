import { useState, useEffect, useRef } from 'react';

/**
 * useCountUp — animates a number from 0 to `end` over `duration` ms.
 * Uses requestAnimationFrame for smooth 60fps counting.
 * Safe against React 18 StrictMode double-invocation.
 */
export function useCountUp(end: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Always cancel any running animation
    cancelAnimationFrame(rafRef.current);

    // If target is 0, set immediately
    if (end === 0) { setValue(0); return; }

    const startTime = performance.now();
    const startValue = 0; // always animate from 0

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo for smooth deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(startValue + (end - startValue) * eased);
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration]);

  return value;
}
