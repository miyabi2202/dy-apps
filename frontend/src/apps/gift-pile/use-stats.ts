import { useEffect, useState } from 'react';
import type { Pile, PileCounts } from './pile';

/** How often the counts on the panel refresh; the canvas itself redraws every frame. */
const STATS_INTERVAL_MS = 200;

/** The counts for the panel, polled a few times a second rather than re-rendering React every frame. */
export function useStats(pile: Pile): PileCounts {
  const [stats, setStats] = useState(() => pile.counts());
  useEffect(() => {
    const id = setInterval(() => {
      const next = pile.counts();
      setStats((prev) =>
        prev.total === next.total && prev.moving === next.moving && prev.queued === next.queued
          ? prev
          : next,
      );
    }, STATS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pile]);
  return stats;
}
