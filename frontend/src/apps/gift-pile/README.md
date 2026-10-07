# 嘉年华堆堆乐 (Gift Pile)

## How it runs

The physics is [Rapier](https://rapier.rs) (`@dimforge/rapier2d-compat`, WASM inlined) in a
module Web Worker, `pile-worker.ts`. The worker owns a `PileEngine` (`core/engine.ts`): the
floor and walls are fixed colliders, each falling icon a dynamic ball with no bounce and some
friction, so heaps form. Once a ball has been near enough to still for a while it is taken out
of the engine and a fixed ball is left in its place, so the engine only ever simulates what is
moving. The worker steps at `stepHz` and posts a `Frame` (`core/protocol.ts`) after each tick:
the moving icons' positions and the ones that just settled. On the page, `PileClient` takes the
frames in and `PileRenderer` draws at display rate, interpolating moving icons between the last
two frames and stamping settled ones onto a static layer once.

Two engine settings matter (`core/config.ts`): the world is handed to Rapier in metres with an
icon 1 m across (`pxPerMetre`), because Rapier's tolerances and speed cap are in metres and
pixel units made every fall crawl; and `contactHz` raises contact stiffness from Rapier's
default of 30 to 120, without which a fast stream sank icons into each other by most of a
radius.

## The bin

The bin (`ui/bin.tsx`) is an HTML element floating over the canvas, so it is outside the
physics and always on top; drag it to move it. Pressing on an icon (`ui/stage.tsx`) sends the
worker a `grab`: the icon leaves the engine entirely while held and the page draws it at the
pointer. Letting go sends `release` (it falls from there) or, over the bin, `destroy`. The
renderer repaints only the removed icon's patch of the resting layer.

## Removing: the plane and the vacuum

减少 doesn't delete icons on the spot. The page asks the worker to `scoop` them: the engine
picks them roughly from the top of the pile down (each icon's height blurred by a few radii,
so the top layer thins out unevenly), sets them aside so no later scoop takes them, and
reports which in the next frame's `scooped`. They stay in the pile as they are.
`render/vacuum-flight.ts` then sends a craft, picked at random, from the left to the right
just above the pile, towing a vacuum cleaner on a rope: a paper plane (Douyin's 纸飞机 emoji,
mirrored and turned to point along its path), a drawn hot-air balloon, or a hypercar, which
runs up one half of a split bridge, jumps the gap in a ballistic arc and comes down onto the
other, lower, half. The balloon is the slowest and the car the quickest, at three seconds. As the nozzle nears each icon the page `grab`s it, so
whatever rested on it falls then and not before, and draws it being sucked up, swinging and
shrinking on the way. The vacuum takes a few more than asked for and spits them out of its
exhaust over the pile (`release`), so the pile loses exactly the number asked for; when the
plane is out of sight the rest are `destroy`ed. Removals queue, each craft setting off two
seconds after the one before is gone, so two are never up at once. One plane carries at most `VACUUM_CAPACITY` icons; anything
over that is removed at once, with no flight, to keep drawing cheap.

## How the pile stays honest

A resting icon is a fixed collider, so it can't notice when what held it up goes. Rather than
guess with geometry, the engine keeps the support graph: only the floor and resting icons
hold an icon up (walls are frictionless and moving icons don't count), so the pile settles from
the ground up; when an icon rests it records what it was touching, and each support remembers
it as a dependent. A support that is taken away, or moves away from where its dependents
rested on it, wakes them. And whenever the pile has changed, a sweep walks the graph from the
floor and wakes every resting icon it can't reach, so icons holding each other up with no path
to the ground fall together. Rapier's own sleep is off for icons: it would leave one hanging
off a single neighbour it should slide down from.

The bin image (`public/bin/recycle-bin.png`) is the Windows-style
[Recycle Bin icon by Icons8](https://icons8.com/icon/set/recycle-bin/color), used under their
free licence, which asks for this link.

## Edge cases

[edge-cases.md](edge-cases.md) states the pile's one invariant (no resting icon without a path
to the floor) and how a new floating-icon case becomes a test in `tests/floating.test.ts`.

## TODO

- A vacuum at the mouse for about a second, pulling nearby icons in. Icons need a velocity in any direction for this, not just a speed along their way down.
- A blast that destroys every icon in range: the same as the rubbish bin for many icons at once, found through the grid, with the icons around the hole woken.
