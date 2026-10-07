import { useEffect, useState } from 'react';
import type { RemovalDirector } from './removal/director';
import type { PileClient } from './pile-client';
import type { PileStats } from './ui/control-panel';

/** How often the counts on the panel refresh; the canvas itself redraws every frame. */
const STATS_INTERVAL_MS = 200;

/** Waiting icons are those the engine hasn't released yet plus those waiting on a removal to be over. */
const readStats = (client: PileClient, director: RemovalDirector): PileStats => ({
  total: client.stats.total,
  falling: client.stats.moving,
  queued: client.stats.queued + director.pendingAdds,
});

/** The counts for the panel, polled a few times a second rather than re-rendering React every frame. */
export function useStats(client: PileClient, director: RemovalDirector): PileStats {
  const [stats, setStats] = useState(() => readStats(client, director));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readStats(client, director);
      setStats((prev) =>
        prev.total === next.total && prev.falling === next.falling && prev.queued === next.queued
          ? prev
          : next,
      );
    }, STATS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [client, director]);
  return stats;
}
