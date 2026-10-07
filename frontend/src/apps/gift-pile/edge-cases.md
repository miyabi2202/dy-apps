# Gift pile: floating-icon edge cases to turn into unit tests

Every case below left an icon hanging in the air, was seen for real (in the browser or in a
Node run of the engine) and was fixed. Each gives a deterministic reproduction and the
invariant that must hold afterwards, so it can become a test in `tests/`. The engine tests run
under `@jest-environment node` with a seeded `mulberry32` rng (see `tests/engine-helpers.ts`),
so a reproduction is "settings + seed + steps". Keep worlds small (a 200–300 px play area, a
few hundred to a few thousand icons) so each test takes seconds.

## The invariant

**No icon floats.** After the pile has come to rest (`movingCount === 0` and `queued === 0`),
every resting icon has a path to the floor through touching resting icons: build the graph of
resting icons whose centres are within `2 × collisionRadius + 1` px of each other, anchor the
ones whose centre is within 1 px of `height - margin - collisionRadius`, and require every
resting icon to reach an anchor. Wall contact is **not** an anchor. This checker exists in the
scratch scripts used during debugging and belongs in `tests/engine-helpers.ts`.

Its companion: **nothing moves forever**. A settle loop capped at 120 s of simulation must end
with `movingCount === 0`; an icon that never rests but never falls is floating too.

## 1. Removing an icon that something rests on

- Symptom: the icon above stays fixed in mid-air.
- Cause: resting icons are fixed colliders; nothing told the dependent its support went.
- Reproduce: settle ~300 icons; pick a resting icon that has a resting icon touching it from
  above (centre within `2r + 1`, lower y); `grab` + `destroy` it; settle.
- Expect: the icon above left rest (`drainWoken` includes it) and the invariant holds.
- Status: partly tested (`engine.test.ts` checks the direct wake); the invariant check is not.

## 2. Removing a moving icon that something rested on (the add, add, remove recipe)

- Symptom: `add 1000`, wait to settle; `add 500`; while they are still falling, `减少 500` →
  icons left in the air.
- Cause: a slow mover could count as support, and removing a mover didn't wake anything. Moving
  icons are now never support, so the pile settles from the ground up.
- Reproduce: settle 1000; `add(500)`; step 20, 45 and 90 steps (three variants); `remove(500)`;
  settle.
- Expect: invariant holds; 8 seeds × 3 timings gave 0 floating after the fix.
- Status: not tested.

## 3. A column up a wall

- Symptom: a vertical run of icons stuck to a wall above the pile, or a single icon on the wall.
- Cause: two things. Wall friction let an icon pressed against the wall by a neighbour above
  hang there (walls are now frictionless). And the old wedge rule counted the icon _above_ as
  the holding neighbour, so the bottom of a column held itself up.
- Reproduce: narrow world (300 wide), settle ~1000; remove 100 at random; settle; repeat. Or
  directly: find a resting icon touching a wall whose only resting neighbours are above it, and
  remove whatever is under it.
- Expect: invariant holds (wall contact is not an anchor).
- Status: not tested.

## 4. Mutual support with no path to the ground (why the sweep exists)

- Symptom: after a bulk removal, a chunk of hundreds of icons hangs with a 60 px gap under it.
- Cause: a woken icon can be held by fixed neighbours that aren't its recorded supports, so
  waking dependents one at a time never collapses a cycle; the floor-reachability sweep wakes
  the whole unreachable set together.
- Reproduce: 300 × 600 world; settle 3000; `remove(500)`, step 60, settle; repeat to empty. 6
  seeds gave 0 floating after every round.
- Expect: invariant after every round.
- Status: not tested. (A direct construction, if wanted: settle a small pile, then `grab` and
  `destroy` every icon in the bottom two rows in one step; the rest must fall.)

## 5. Drift adding up across wakes

- Symptom: a support woken and re-rested a few times ends up 1–3 px below where its dependent
  rested on it; eventually the dependent hangs.
- Cause: the anchor (where dependents rested on a support) was reset on each wake, so each
  cycle allowed another half-radius of drift.
- Reproduce: hard to construct directly; it shows up as 1–2 px gaps in the repeated-removal
  scenario of case 4 when the invariant's tolerance is 1 px.
- Expect: with the 1 px tolerance, the invariant still holds (the engine hands dependents on
  when a support re-rests more than 0.5 px from its anchor).
- Status: not tested.

## 6. The engine's sleep leaving an icon hanging off one neighbour

- Symptom: a dynamic icon sitting still against a single neighbour above-left of it, never
  resting and never falling.
- Cause: Rapier put the body to sleep before it slid off; sleep is now disabled for icons.
- Reproduce: settle 3000 in a 300 × 600 world with seed 2 (the straggler was `#1770`).
- Expect: nothing moves forever, and the invariant holds.
- Status: not tested.
