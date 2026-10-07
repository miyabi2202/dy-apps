# Gift pile: edge cases to turn into unit tests

Every case below was seen for real (in the browser or in a Node run of the engine) and fixed.
Each gives a deterministic reproduction and the invariant that must hold afterwards, so it can
become a test in `tests/`. The engine tests run under `@jest-environment node` with a seeded
`mulberry32` rng (see `tests/engine-helpers.ts`), so a reproduction is "settings + seed +
steps". Keep worlds small (a 200–300 px play area, a few hundred to a few thousand icons) so
each test takes seconds.

## The invariant behind most cases

**No icon floats.** After the pile has come to rest (`movingCount === 0` and `queued === 0`),
every resting icon has a path to the floor through touching resting icons: build the graph of
resting icons whose centres are within `2 × collisionRadius + 1` px of each other, anchor the
ones whose centre is within 1 px of `height - margin - collisionRadius`, and require every
resting icon to reach an anchor. Wall contact is **not** an anchor. This checker exists in the
scratch scripts used during debugging and belongs in `tests/engine-helpers.ts`.

Two companions: **nothing moves forever** (a settle loop capped at, say, 120 s of simulation
ends with `movingCount === 0`), and **counts add up** (`alive === count - destroyed`,
resting + moving + held = alive).

## Engine: floating icons

### 1. Removing an icon that something rests on

- Symptom: the icon above stays fixed in mid-air.
- Cause: resting icons are fixed colliders; nothing told the dependent its support went.
- Reproduce: settle ~300 icons; pick a resting icon that has a resting icon touching it from
  above (centre within `2r + 1`, lower y); `grab` + `destroy` it; settle.
- Expect: the icon above left rest (`drainWoken` includes it) and the invariant holds.
- Status: partly tested (`engine.test.ts` checks the direct wake); the invariant check is not.

### 2. Removing a _moving_ icon that something rested on (the add, add, remove recipe)

- Symptom: `add 1000`, wait to settle; `add 500`; while they are still falling, `减少 500` →
  icons left in the air.
- Cause: a slow mover could count as support, and removing a mover didn't wake anything.
- Reproduce: settle 1000; `add(500)`; step 20, 45 and 90 steps (three variants); `remove(500)`;
  settle.
- Expect: invariant holds; 8 seeds × 3 timings gave 0 floating after the fix.
- Status: not tested.

### 3. A column up a wall

- Symptom: a vertical run of icons stuck to a wall above the pile.
- Cause: two things. Wall friction let an icon pressed against the wall by a neighbour above
  hang there (walls are now frictionless). And the old wedge rule counted the icon _above_ as
  the holding neighbour, so the bottom of a column held itself up.
- Reproduce: narrow world (300 wide), settle ~1000; remove 100 at random; settle; repeat. Or
  directly: find a resting icon touching a wall whose only resting neighbours are above it, and
  remove whatever is under it.
- Expect: invariant holds (wall contact is not an anchor).
- Status: not tested.

### 4. Mutual support with no path to the ground (why the sweep exists)

- Symptom: after a bulk removal, a chunk of hundreds of icons hangs with a 60 px gap under it.
- Cause: a woken icon can be held by fixed neighbours that aren't its recorded supports, so
  waking dependents one at a time never collapses a cycle; the floor-reachability sweep wakes
  the whole unreachable set together.
- Reproduce: 300 × 600 world; settle 3000; `remove(500)`, step 60, settle; repeat to empty. 6
  seeds gave 0 floating after every round.
- Expect: invariant after every round.
- Status: not tested. (A direct construction, if wanted: settle a small pile, then `grab` and
  `destroy` every icon in the bottom two rows in one step; the rest must fall.)

### 5. Drift adding up across wakes

- Symptom: a support woken and re-rested a few times ends up 1–3 px below where its dependent
  rested on it; eventually the dependent hangs.
- Cause: the anchor (where dependents rested on a support) was reset on each wake, so each
  cycle allowed another half-radius of drift.
- Reproduce: hard to construct directly; it shows up as 1–2 px gaps in the repeated-removal
  scenario of case 4 when the invariant's tolerance is 1 px.
- Expect: with the 1 px tolerance, the invariant still holds (the engine hands dependents on
  when a support re-rests more than 0.5 px from its anchor).
- Status: not tested.

### 6. The engine's sleep leaving an icon hanging off one neighbour

- Symptom: a dynamic icon sitting still against a single neighbour above-left of it, never
  resting and never falling.
- Cause: Rapier put the body to sleep before it slid off; sleep is now disabled for icons.
- Reproduce: settle 3000 in a 300 × 600 world with seed 2 (the straggler was `#1770`); the
  settle loop must end with `movingCount === 0` within 120 s.
- Expect: nothing moves forever.
- Status: not tested.

### 7. Soft contacts a fraction of a pixel apart

- Symptom: an icon standing on another never rests ("no support") because its contact distance
  is slightly positive.
- Cause: Rapier's soft contacts hold resting bodies up to a fraction of a pixel apart;
  touching needs a 1 px tolerance (`TOUCH_GAP`).
- Reproduce: any settle; assert everything rests (case 6's check covers it).
- Status: covered indirectly by "nothing moves forever".

### 8. Resting on a slow mover

- Symptom: an icon rests on a slow mover that then speeds up and leaves; the icon hangs.
- Cause: moving icons were allowed as support without being watched.
- Now: moving icons are never support; the pile settles from the ground up.
- Reproduce: as case 2.
- Status: not tested.

## Engine: counts and picking

### 9. 减少 removing fewer than asked

- Symptom: 100 → 95 → … → 10 → 6 → 5 → 4 → … → 1 → 1 → 1 → 0.
- Cause: random indices with a try cap, so once most icons were dead a click often hit nothing.
- Expect: `remove(5)` from 100 settled icons, 20 times, gives exactly 95, 90, …, 0.
- Status: tested (`engine.test.ts`).

### 10. Woken icons spawning "overlapping"

- Symptom: a woken icon and the icons around it overlap by several pixels and never separate.
- Cause (earlier engine): a woken icon was launched inside a neighbour; now the wake happens
  where the icon already is, so this is only a regression check.
- Expect: after any scenario above, no two resting icons are closer than `2r - r/2`.
- Status: tested for a plain settle (`engine.test.ts`), not after removals.

## Renderer: resting layer

### 11. The last icon in the list leaving

- Cause: the stamped count was shrunk before the "was it painted?" check.
- Status: tested (`renderer.test.ts`).

### 12. An icon moved into a gap, then moved again before a draw

- Cause: the pending-stamp list stored slots, which further removals remapped.
- Status: tested.

### 13. Settled and woken within one frame

- Cause: woken was processed before settled, so the icon was removed before it existed and
  then added as a ghost.
- Status: tested.

### 14. Anti-aliased repaint leaving 1 px slivers

- Cause: clearing and clipping a fractional-coordinate patch is anti-aliased.
- Now: the patch is widened to whole device pixels.
- Reproduce (browser): render a pile, remove many icons, redraw the renderer's own lists onto a
  second canvas and diff; before the fix hundreds of pixels differed, after it 0–7.
- Status: not unit-tested (needs a real canvas); a Playwright spec could diff the canvas
  against a redraw of `restingXy` as the debugging script did.

## Interaction (Playwright, not Jest)

### 15. Dropping on the bin with a flick

- Symptom: the pointerup lands outside the bin although it was lit; the icon was dropped
  instead of destroyed, or stayed stuck to the pointer if capture was lost.
- Now: the drop goes in if the bin was lit for the last move, and `lostpointercapture`
  finishes the drag.
- Status: not tested; Playwright serialises events so the flick doesn't reproduce; test the
  "bin lit on last move, pointerup outside" sequence directly.

### 16. Press just outside the bin image

- Expect: a press in the ring between the 44 px drag handle and the 56 px drop zone reaches the
  canvas (`document.elementFromPoint` is the canvas) and picks up an icon.
- Status: checked by a scratch script, not a spec.

### 17. Hit radius

- Expect: a press within `grabRadius` (12 px) of an icon's centre picks it up, nearest wins.
- Status: checked by a scratch script, not a spec.
