# Gift pile: floating-icon edge cases

Every way an icon has been left floating in the air so far has a test in
[`tests/floating.test.ts`](tests/floating.test.ts), one per case, in the order the cases were
found: a removed support, a removed mover that something rested on, a column up a wall, a
narrow world under repeated removal, mutual support with no path to the ground, drift across
wakes, and a big pour with no straggler. The tests run on small worlds with a seeded rng;
Rapier is deterministic for a seed, so they repeat to the pixel.

## The invariant

**No icon floats.** After the pile has come to rest (`movingCount === 0` and `queued === 0`),
every resting icon has a path to the floor through touching resting icons: resting icons
whose centres are within `2 × collisionRadius + 1` px of each other touch, the ones whose centre
is within 1 px of `height - margin - collisionRadius` anchor, and every resting icon must reach
an anchor. Wall contact is **not** an anchor. `floating(engine)` in `tests/engine-helpers.ts`
returns the icons that fail it; `settle(engine)` there throws if anything is still moving
after 30 s of simulation, since an icon that never rests but never falls is floating too.

A stricter check ("every icon off the floor has a touching neighbour lower than itself") is
wrong: real friction arches rest on near-level neighbours.

## Adding a case

When an icon is found floating again, write the reproduction here first (world size, seed,
steps, what was removed), then make it a test in `floating.test.ts` and delete it from here.
