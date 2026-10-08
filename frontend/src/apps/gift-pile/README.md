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

## Removing: the removers

减少 doesn't delete icons on the spot. When its turn comes (see below), the page works out
from the pile's count what to take (`planRemoval` in `removal/queue.ts`): a quarter
more than asked for, or all there is if that is less, of which what is over the number will
be dropped back, so the pile loses just the number. It asks the worker to `scoop` that many: the engine picks them roughly
from the top of the pile down (each icon's height blurred by a few radii, so the top layer
thins out unevenly), sets them aside so no later scoop takes them, and reports which in the
next frame's `scooped`. They stay in the pile as they are. The remover for the removal is
dealt before the scoop is asked for, so it can say which icons it wants (its `shape`, a
`ScoopShape` in `core/protocol.ts`): a rounded `clump` off the top of the pile at a point
across it, nearest first, or the pile's outer `layers`, evenly all across and no blur, one
before the next.

The `RemovalDirector` (`removal/director.ts`) then deals a `Remover` from a shuffle bag, so
each comes up as often as the others and never twice running, and has it `begin` a `Removal`
on a `Board`: one at a time, drawn as the renderer's `Overlay` (`render/overlay.ts`). The
contract is `removal/board.ts`, and it is all the pile knows of removers: the board gives a
removal the icons set aside for it and lets it look where each is (`where`), `take` one out of
the pile, `drop` one back, `destroy` one, and `stamp` an icon anywhere. The pile's side of it,
`ScoopBoard` (`scoop-board.ts`), keeps the books, so each icon is `grab`bed before it moves
and, when the removal is over, every one it didn't drop is `destroy`ed. Each remover has its
own folder under `removal/` and decides for itself how it moves, what it looks like (it loads
its own images, `load`) and how it carries icons off; they are listed in one place,
`removal/removers.ts`, which `createPile()` in `create-pile.ts` hands to the director. To add
one, implement `Remover` in a new folder, list it there, and give it a name to show in
`messages.ts`. Under the 添加嘉年华 panel, 清除动画 (closed until opened) has a checkbox for each
remover; the director deals only the ones ticked (`setEnabled`), and the ones unticked are
remembered on the browser (`removersOffStore` in `settings.ts`), so one added later starts on.

Removers share what they like from `removal/kit/`: easing curves (`easing.ts`), aiming at a
clump of the pile and finding where it is (`clump.ts`), stepping in small fixed steps however
far apart the frames are (`clock.ts`), the top of the pile to walk along (`pile-top.ts`), and
SVG art in any colouring (`svg-art.ts`). Two of them are crafts (`Craft` in
`kit/craft.ts`) that run a `Crossing` (`kit/crossing.ts`): the craft crosses from the left to
the right just above the pile, taking icons in with its `Intake`, which is the craft's to
choose: so far a `Vacuum` cleaner towed on a rope (`vacuum.ts`) for both. A craft says how long it takes to
cross, where the intake fits on, its path, and how to draw it and any scenery: the hot-air
balloon (`balloon/`) is drawn, and the `hypercar/` runs up one
half of a split bridge, jumps the gap in a ballistic arc and comes down onto the other, lower,
half. The balloon is the
slowest and the car the quickest, at three seconds. Each craft picks
its colours for the crossing from its palettes when it begins: the balloon's stripes, skirt and
and outline, and the car's body and trim.

Six removers don't cross. The `helicopter/` (drawn from Microsoft's Fluent Emoji SVG, MIT,
credited in its `art.ts`, with `kit/svg-art.ts`, mirrored to face right with its rotors drawn
turning over it: `chopper.ts`) flies in from the left and hovers over the middle of the pile
(`mission.ts`). A winchman (`winchman.ts`) goes down the rope with a vacuum on his back, its hose
up to the helicopter, lets go onto the pile, and walks it end to end, lower each time, vacuuming
the icons by his nozzle and down into the pile below it, until he has all the board's icons:
the pile's outer layers, so they are along his way. He walks back to the rope and is winched
up; if some are to be dropped, the helicopter sags under the weight and throws them out of the
door, then rises back, winches him in and flies off to the right. Its paint schemes are swaps
of the art's own fills, each turned into an image once when the page loads. Pac-Man (`pac-man/`), always the same size and speed, eats his way
through the pile row by row with a ghost on his heels: in from the left along the top of the
pile (`kit/pile-top.ts`), he eats whatever is in front of him, and at the end of a row goes down
one and comes back the other way, until he has eaten all the board's icons (`run.ts`), which are the pile's outer layers, so just
the ones he meets. Then,
if some are to be dropped back, the ghost, following where he has been (`trail.ts`), catches
him and he shrivels away as they burst back out of him; if not (the pile had no more than
asked for), he runs off. His drawing and the ghost's are in `sprites.ts`. The flying saucer (`ufo/`, also from Fluent Emoji) aims at a
spot, flies in and stops over it, and shines its tractor beam (`ufo/beam.ts`) down on the
clump: the icons rise up it into its belly, a few falling back out part way, then the beam
goes off and it zips away. The claw machine (`claw/`) aims at a spot, slides along a rail at
the top to it, lowers the claw and draws the clump up into a bunch in its grip (shrunk to fit
if there are many), lets a few slip out on the way up, and carries the rest off. The fireworks
(`fireworks/`) send the icons up in a handful of rockets, each gathered from its own stretch of
the pile, that burst into sparks; the icons fly apart with the sparks and are `destroy`ed as
they burn out, so the count goes down burst by burst, and the duds fall back onto the pile.
The black hole (`black-hole/`) aims at a spot, opens over the clump with a spinning accretion
disk, and swallows it, the icons spiralling in and shrinking as they go; the duds it flings
back out on the swing, `drop`ping them moving, and then it collapses with a pop.

As the intake nears each icon the page `grab`s it, so whatever rested on it falls then and
not before, and draws it being drawn in, swinging and shrinking on the way. The ones to drop
come back out over the pile (`release`: out of the vacuum's exhaust, say) and fall as physics
has them; the stage tells the director where the bin is, and a dropped icon that falls into it
is destroyed, with the bin lighting up, so moving the bin under the craft catches more. When
the craft is out of sight the rest are `destroy`ed.

Presses queue in order (`ActionQueue` in `removal/queue.ts`): each removal begins a second
after the one before is over, so two are never under way at once, and 添加 waits for any
removal under way (the panel counts those icons as 待添加 meanwhile). One removal carries at
most `LOAD_CAPACITY` icons; anything over that is removed at once, unseen, to keep drawing
cheap.

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

## TODO

- A vacuum at the mouse for about a second, pulling nearby icons in. Icons need a velocity in any direction for this, not just a speed along their way down.
- A blast that destroys every icon in range: the same as the rubbish bin for many icons at once, found through the grid, with the icons around the hole woken.
