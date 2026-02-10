import { useState, useEffect } from "react";

export function useCountdown(targetMs: number): number {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, targetMs - Date.now()),
  );

  useEffect(() => {
    setRemaining(Math.max(0, targetMs - Date.now()));

    const id = setInterval(() => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setRemaining(0);
        clearInterval(id);
      } else {
        setRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [targetMs]);

  return remaining;
}
