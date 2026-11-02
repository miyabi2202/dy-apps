import { CONFIG } from '../core/config';
import { constantRng } from '../core/random';
import { ballotChoice, VoteBox } from '../core/room/vote-box';

const { durationMs, extendMs, resultMs } = CONFIG.votes;
const drawer = { id: 'd', name: '阿杰' };
const a = { id: 'a', name: '小美' };
const b = { id: 'b', name: '老王' };

/** An open vote; rng 0 picks the first two options and breaks ties to the first. */
function opened(): VoteBox {
  const box = new VoteBox(constantRng(0));
  box.open(drawer, 'rare', ['garbage', 'spin', 'twin']);
  return box;
}

describe('ballotChoice', () => {
  it('reads a 1 or a 2 anywhere, half- or full-width; both or neither is no vote', () => {
    expect(ballotChoice('选1')).toBe(0);
    expect(ballotChoice('2222')).toBe(1);
    expect(ballotChoice('２')).toBe(1);
    expect(ballotChoice('12')).toBeNull();
    expect(ballotChoice('加油')).toBeNull();
  });
});

describe('VoteBox', () => {
  it('opens on an uncommon or rare draw by chance, never a common one or a second at once', () => {
    const box = new VoteBox(constantRng(0));
    expect(box.rolls('common')).toBe(false);
    expect(box.rolls('rare')).toBe(true);
    expect(new VoteBox(constantRng(CONFIG.votes.chance)).rolls('rare')).toBe(false);
    box.open(drawer, 'rare', ['garbage', 'spin']);
    expect(box.rolls('rare')).toBe(false);
    expect(box.open(drawer, 'rare', ['garbage', 'spin'])).toBe(false);
  });

  it('puts two different curses up, and needs two to choose from', () => {
    expect(opened().view!.options).toEqual(['garbage', 'spin']);
    expect(new VoteBox(constantRng(0)).open(drawer, 'rare', ['garbage'])).toBe(false);
  });

  it('lets a viewer change their vote; the most votes win', () => {
    const box = opened();
    box.cast(a, '1');
    box.cast(b, '1');
    box.cast(a, '2');
    box.cast(b, '2');
    expect(box.view!.ballots).toHaveLength(2);
    expect(box.advance(durationMs)).toEqual({ kind: 'decided', type: 'spin', counts: [0, 2] });
    expect(box.cast(a, '1')).toBe(false);
  });

  it('with no votes or a tie, picks at random', () => {
    expect(opened().advance(durationMs)).toMatchObject({ kind: 'decided', type: 'garbage' });
    const tied = opened();
    tied.cast(a, '1');
    tied.cast(b, '2');
    expect(tied.advance(durationMs)).toMatchObject({ kind: 'decided', counts: [1, 1] });
  });

  it('takes extra time while it counts, shows the winner, then closes', () => {
    const box = opened();
    expect(box.extend()).toBe(true);
    expect(box.advance(durationMs)).toMatchObject({ kind: 'counting' });
    expect(box.advance(extendMs)).toMatchObject({ kind: 'decided' });
    expect(box.extend()).toBe(false);
    expect(box.advance(resultMs - 1)).toEqual({ kind: 'showing' });
    expect(box.advance(1)).toEqual({ kind: 'closed' });
    expect(box.view).toBeNull();
  });
});
