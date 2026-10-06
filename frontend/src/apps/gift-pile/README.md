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
pointer. Letting go sends `release` (it falls from there) or, over the bin, `destroy`. Taking
a resting icon out of the pile wakes the resting icons touching it from above, and each one
that moves half a radius wakes the ones that rested on it in turn, so the pile settles into
the gap. The renderer repaints only the removed icon's patch of the resting layer.

## TODO

- A vacuum at the mouse for about a second, pulling nearby icons in. Icons need a velocity in any direction for this, not just a speed along their way down.
- A blast that destroys every icon in range: the same as the rubbish bin for many icons at once, found through the grid, with the icons around the hole woken.
