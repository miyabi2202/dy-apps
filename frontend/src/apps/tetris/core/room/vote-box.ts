import { CONFIG } from '../config';
import type { EffectType, Rarity } from '../curses';
import { randomInt, type Rng } from '../random';
import type { Sender } from '../types';

/** One viewer's vote: the index of the option they picked. Changing it replaces it. */
export interface Ballot {
  voter: Sender;
  choice: number;
}

/**
 * A vote: chat picks which of `options` goes in for the curse `sender` drew. Once time is up,
 * `winner` is set and shows for a moment before it closes.
 */
export interface VoteView {
  id: number;
  sender: Sender;
  rarity: Rarity;
  options: readonly EffectType[];
  ballots: readonly Ballot[];
  remainingMs: number;
  winner: number | null;
}

/** What one step of the vote's clock did. */
export type VoteStep =
  | { kind: 'counting'; changed: boolean }
  | { kind: 'decided'; type: EffectType; counts: number[] }
  | { kind: 'showing' }
  | { kind: 'closed' };

/** A chat's vote: a 1 anywhere in it is the first option, a 2 the second; both or neither, none. */
export function ballotChoice(text: string): 0 | 1 | null {
  const one = /[1１]/.test(text);
  const two = /[2２]/.test(text);
  if (one === two) return null;
  return one ? 0 : 1;
}

/**
 * At most one vote at a time, and one a round: whether a draw opens one, the two options, the
 * ballots, the clock and the result. It knows nothing of the game; the caller queues the winner,
 * holds play and says when a new round starts.
 */
export class VoteBox {
  view: VoteView | null = null;
  private id = 0;
  private resultMs = 0;
  /** A vote has opened since the round began. */
  private votedThisRound = false;

  constructor(private readonly rng: Rng) {}

  /** Whether a draw of `rarity` opens a vote: never a common one, while one is open, or a second in a round. */
  rolls(rarity: Rarity): boolean {
    if (rarity === 'common' || this.view || this.votedThisRound) return false;
    return this.rng.next() < CONFIG.votes.chance;
  }

  /** Puts two different curses of `types` to the vote; false when there aren't two. */
  open(sender: Sender, rarity: Rarity, types: readonly EffectType[]): boolean {
    if (this.view || types.length < 2) return false;
    this.votedThisRound = true;
    const first = randomInt(this.rng, types.length);
    let second = randomInt(this.rng, types.length - 1);
    if (second >= first) second += 1;
    this.id += 1;
    this.view = {
      id: this.id,
      sender,
      rarity,
      options: [types[first]!, types[second]!],
      ballots: [],
      remainingMs: CONFIG.votes.durationMs,
      winner: null,
    };
    return true;
  }

  /** A viewer's chat while the vote counts; a later vote replaces their earlier one. */
  cast(voter: Sender, text: string): boolean {
    const vote = this.view;
    if (!vote || vote.winner !== null) return false;
    const choice = ballotChoice(text);
    if (choice === null) return false;
    const others = vote.ballots.filter((b) => b.voter.id !== voter.id);
    this.view = { ...vote, ballots: [...others, { voter, choice }] };
    return true;
  }

  /** The streamer's extra time while it counts. */
  extend(): boolean {
    const vote = this.view;
    if (!vote || vote.winner !== null) return false;
    this.view = { ...vote, remainingMs: vote.remainingMs + CONFIG.votes.extendMs };
    return true;
  }

  /** Counts down; at zero the most votes win (no votes or a tie: at random), shown, then closed. */
  advance(dtMs: number): VoteStep {
    const vote = this.view!;
    if (vote.winner !== null) {
      this.resultMs += dtMs;
      if (this.resultMs < CONFIG.votes.resultMs) return { kind: 'showing' };
      this.view = null;
      return { kind: 'closed' };
    }
    const remainingMs = vote.remainingMs - dtMs;
    if (remainingMs > 0) {
      this.view = { ...vote, remainingMs };
      // Often enough for a smooth countdown, not every frame.
      return {
        kind: 'counting',
        changed: Math.ceil(remainingMs / 100) !== Math.ceil(vote.remainingMs / 100),
      };
    }
    const counts = vote.options.map((_, i) => vote.ballots.filter((b) => b.choice === i).length);
    const best = Math.max(...counts);
    const leaders = counts.flatMap((n, i) => (n === best ? [i] : []));
    const winner = leaders[randomInt(this.rng, leaders.length)]!;
    this.view = { ...vote, remainingMs: 0, winner };
    this.resultMs = 0;
    return { kind: 'decided', type: vote.options[winner]!, counts };
  }

  /** A settlement started a new round: draws may open a vote again. */
  newRound(): void {
    this.votedThisRound = false;
  }

  reset(): void {
    this.view = null;
    this.resultMs = 0;
    this.votedThisRound = false;
  }
}
