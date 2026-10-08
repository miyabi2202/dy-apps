import { useEffect, useState } from 'react';
import type { Pile } from './pile';
import type { PileStats } from './ui/control-panel';

/** How often the counts on the panel refresh; the canvas itself redraws every frame. */
const STATS_INTERVAL_MS = 200;

/** Waiting icons are those the engine hasn't released yet plus those waiting on a removal to be over. */
const readStats = (pile: Pile): PileStats => {
  const { total, moving, queued } = pile.counts();
  return { total, falling: moving, queued };
};

/** The counts for the panel, polled a few times a second rather than re-rendering React every frame. */
export function useStats(pile: Pile): PileStats {
  const [stats, setStats] = useState(() => readStats(pile));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readStats(pile);
      setStats((prev) =>
        prev.total === next.total && prev.falling === next.falling && prev.queued === next.queued
          ? prev
          : next,
      );
    }, STATS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pile]);
  return stats;
}
