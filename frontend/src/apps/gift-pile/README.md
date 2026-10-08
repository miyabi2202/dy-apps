# 嘉年华堆堆乐 (Gift Pile)

## How it runs

The physics is [Rapier](https://rapier.rs) (`@dimforge/rapier2d-compat`, WASM inlined) in a
module Web Worker, `pile-worker.ts`. The worker owns a `PileEngine` (`core/engine.ts`): the
floor and walls are fixed colliders, each falling icon a dynamic ball with no bounce and some
friction, so heaps form. Once a ball has been near enough to still for a while it is taken out
of the engine and a fixed ball is left in its place, so the engine only ever simulates what is
moving. The worker steps at `stepHz` and posts a `Frame` (`core/protocol.ts`) after each tick:
the moving icons' positions and the ones that just settled. On the page, `PileClient` takes the
frames in and hands them to the `Pile` (`pile.ts`), the one thing the page and the stage talk
to. The `Pile` owns four others and passes what each needs between them, so none of them knows
of the rest: a `PileState` (`render/pile-state.ts`), which records where every icon is; a
`Camera` (`render/camera.ts`), which says what part of the world is on screen; the
`GlRenderer` (`render/gl-renderer.ts`, WebGL2 in `render/gl/`), which draws at display rate,
interpolating moving icons between the last two frames in the vertex shader and keeping the
resting ones in a GPU buffer that is topped up as icons settle; and the `RemovalDirector`. `createPile()` (`create-pile.ts`) builds the real ones, once, for the page.

A frame is taken in on its message, not at the next display frame, because the renderer
interpolates by when the latest one arrived: `Pile.onFrame` has the state record it (the first
frame of a new generation, after a clear or resize, first resets the removals and the camera),
the renderer take in what left the resting set, and the director take the scoops. Each display
frame, `Pile.frame` (from the loop in `loop.ts`) steps the camera and has the renderer `begin` the
frame (it draws the pile and hands back a `Gfx`), draws the removals over it with that `Gfx`, and
then the renderer `end`s it with the icon in the user's hand and puts it on the canvas. If the
browser has no WebGL2 the renderer can't draw, and the page says so.

`PileState` keeps the resting icons in typed arrays in order of settling, each with its slot,
the latest two frames, and answers where an icon is (`peek`), takes one out (`take`), finds the
top of the pile (`topAt`, `profile`, `highestTop`) and the icon under a point (`iconAt`). The
renderer's resting buffer follows the resting set from a journal that the state keeps of what
left it (slot, the last slot then, the icon moved in to fill it, and where it was), so what
needs sending again is only the slots a removal swap-filled, and the buffer is never compared
with the set.

Two engine settings matter (`core/config.ts`): the world is handed to Rapier in metres with an
icon 1 m across (`pxPerMetre`), because Rapier's tolerances and speed cap are in metres and
pixel units made every fall crawl; and `contactHz` raises contact stiffness from Rapier's
default of 30 to 120, without which a fast stream sank icons into each other by most of a
radius.

## The camera

Once the pile grows into the top third of the canvas (`headroom` in `core/config.ts`), the
`Camera` moves the view up with it, easing, so the removals always have open sky to work in;
the bottom of the pile goes out of sight. It comes back down as the pile does, but never below
the floor, and holds still while a removal is under way, unless the removal moves it. The
camera is a pure step: each frame the `Pile` tells it the time, how high the pile's heap is
(`PileState.highestTop`: what rests, and what has moved a while, but not the stream just let
in) and whether a removal is on, and it gives back the view; anyone who cares is told when it
moves (`subscribe`). It is a small machine of modes, a removal over following the pile, so
that something of higher priority, like the user's own navigation, can be added over them.

New icons drop in from just above where the view is heading: the `Pile` works the line out
from the camera's target (less an icon's radius) and sends the engine a `setDropLine` command
when it changes; the engine knows nothing of the camera, and releases at the line, or just
above the canvas's top until it is told.

Everything is drawn in world pixels shifted by the view (a uniform in the shaders), so the
camera moving costs the GPU nothing to redo. Pointer
presses are turned into world pixels with the view (`Pile.toWorld`), and the bin moves with
the world as the camera does, kept on the canvas so it can always be dragged: the stage moves
it from the camera's subscription directly on its element, not through React state, so a
camera easing for a second doesn't render the stage on every frame. Removals get the camera
on their `Board` (`camera.view`, and come, go and hover within it), and can move it while they
run (`moveTo`, or `keepInView` to move it only as far as something needs): Pac-Man and the
helicopter's winchman keep themselves in view as they work down into the pile, the helicopter
coming down with the view if it has to. Once a removal is over, the camera follows the pile
again.

## The bin

The bin (`ui/bin.tsx`) is an HTML element floating over the canvas, so it is outside the
physics and always on top; drag it to move it. Pressing on an icon (`ui/stage.tsx`) has the
`Pile` send the worker a `grab`: the icon leaves the engine entirely while held and the
renderer draws it at the pointer. Letting go sends `release` (it falls from there) or, over
the bin, `destroy`.

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

The `RemovalDirector` (`removal/director.ts`), which the `Pile` makes with the client as its
sink for the engine's commands, then deals a `Remover` from a shuffle bag, so each comes up as
often as the others and never twice running, and has it `begin` a `Removal` on a `Board`: one
at a time, drawn over the pile by the `Pile` each frame, after the pile itself. The
contract is `removal/board.ts`, and it is all the pile knows of removers: the board gives a
removal the icons set aside for it and lets it look where each is (`where`), `take` one out of
the pile, `drop` one back, `destroy` one, and `stamp` an icon anywhere. The pile's side of it,
`ScoopBoard` (`scoop-board.ts`), keeps the books, so each icon is `grab`bed before it moves
and, when the removal is over, every one it didn't drop is `destroy`ed. What it needs to know
of the pile (where icons are, where to stamp, the camera) comes from a `Ground` that the
`Pile` makes, from its state, its renderer and its camera. Each remover has its
own folder under `removal/` and decides for itself how it moves, what it looks like (it loads
its own images, `load`) and how it carries icons off; they are listed in one place,
`removal/removers.ts`, which `createPile()` in `create-pile.ts` hands to the `Pile`. To add
one, implement `Remover` in a new folder, list it there, and give it a name to show in
`messages.ts`. Under the 添加嘉年华 panel, 清除动画 (closed until opened) has a checkbox for each
remover; the director deals only the ones ticked (`setEnabled`), and the ones unticked are
remembered on the browser (`removersOffStore` in `settings.ts`), so one added later starts on.

Removers share what they like from `removal/kit/`: easing curves (`easing.ts`), aiming at a
clump of the pile and finding where it is (`clump.ts`), stepping in small fixed steps however
far apart the frames are (`clock.ts`), the top of the pile to walk along (`pile-top.ts`). Two of them are crafts (`Craft` in
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

Removers get showy effects from `Gfx` (`render/gfx.ts`): glows, particles, ribbons, speed lines,
materials on sprites (`holo`, `metal`, `rim`, `solid`), a procedural `blackHole`, `saucer` and `plasmaBeam`, and ones that
act on the whole picture once it is drawn (`shockwave`, `lens`, `haze`, `aberration`, `flash`),
which the renderer's post pass applies (`render/gl/post-pass.ts`). On `high` quality that pass
also adds bloom and the pile gets a faint sweeping sheen; `low` drops both and gives every
`Emitter` (`kit/particles.ts`, a pool of particles stepped by time; `kit/fx.ts` has bursts to
use with it, `Wake` in `kit/trail.ts` the points of a ribbon) 40% of its room. The quality, and
whether the cut-in banner and the shake are on, are chosen under 炫酷特效 and remembered on the
browser (`effectsStore`; the quality starts as `low` on a touch screen or a device with four
cores or fewer). A visitor who asks the system for less motion gets no shake or freeze-frame
whatever is ticked (`Pile.motion`).

Each remover also has its moment on the screen, through its `Board`'s `fx`: `shake(amplitude,
ms)`, `hitStop(ms)`, which freezes the removal's own clock (the director gives it the time less
what it has spent frozen, so what it draws and when it is over stand still together), and
`cutIn(request)`, the anime banner (`ui/cut-in.tsx`) with the remover's name, its line
(`labels.cutIn.lines`) and a portrait (`kit/portraits.ts`, or the remover's own art, painted
once by `render/bake.ts`). The removal is paused for as long as the banner is up (`CUT_IN_MS`, handed to the director by
`create-pile.ts`)
and carries on once it is gone, even when freeze-frames are off. A remover asks for it at its best moment, once, and the director
lets one through every 8 s at most, so asking is always safe. Each remover is dressed with the kit
at hand: the helicopter has downwash, a searchlight and a vortex at the nozzle (`helicopter/
effects.ts`), the saucer a chrome hull, a dome of swirling energy, a beam of scrolling bands and a
streak as it leaves; the balloon a burner flame, streamers and dust; the car underglow, headlights, ghosts,
nitro and a landing that shakes the screen; Pac-Man a neon glow, pellets, crumbs and a power
pellet, and the ghost an ectoplasm trail; the claw a spotlight, a chasing LED rail and
confetti; the fireworks five burst styles (peony, chrysanthemum, ring, willow, crossette) with a
flash, a ring of air and a split of colour for each; and the black hole its lensing, a banded
disk, icons stretched along their fall and a pop that flashes, rings and shakes. Their particles
are `Emitter`s stepped by `Frames` (`kit/clock.ts`), the time since the last draw, so they stand
still in a hit-stop as the rest does.

Six removers don't cross. The `helicopter/` (drawn wholly in GLSL by `Gfx.chopper`, facing right: glossy
car-paint fuselage with a stripe, tinted cockpit glass with a pilot, a main rotor blurred into a
shimmering disc with glowing tips, a turning tail rotor and blinking lights; `chopper.ts`; its
portrait for the cut-in is in `kit/portraits.ts`) flies in from the left and hovers over the middle of the pile
(`mission.ts`). A winchman (`winchman.ts`) goes down the rope with a vacuum on his back, its hose
up to the helicopter, lets go onto the pile, and walks it end to end, lower each time, vacuuming
the icons by his nozzle and down into the pile below it, until he has all the board's icons:
the pile's outer layers, so they are along his way. He walks back to the rope and is winched
up; if some are to be dropped, the helicopter sags under the weight and throws them out of the
door, then rises back, winches him in and flies off to the right. Its paint schemes are a body colour and a stripe colour. Pac-Man (`pac-man/`), always the same size and speed, eats his way
through the pile row by row with a ghost on his heels: in from the left along the top of the
pile (`kit/pile-top.ts`), he eats whatever is in front of him, and at the end of a row goes down
one and comes back the other way, until he has eaten all the board's icons (`run.ts`), which are the pile's outer layers, so just
the ones he meets. Then,
if some are to be dropped back, the ghost, following where he has been (`trail.ts`), catches
him and he shrivels away as they burst back out of him; if not (the pile had no more than
asked for), he runs off. His drawing and the ghost's are in `sprites.ts`. The flying saucer (`ufo/`, drawn wholly in GLSL by `Gfx.saucer`: a chrome hull, a ring of chasing
lights, a glass dome of swirling energy; its portrait for the cut-in is in `kit/portraits.ts`) aims at a
spot, flies in and stops over it, and shines its tractor beam (`ufo/beam.ts`, a rippling plasma
beam from `Gfx.plasmaBeam`) down on the
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
is destroyed, with the bin lighting up (the stage tells the `Pile` where the bin is), so
moving the bin under the craft catches more. When
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

## Credits

The saucer's and beam's shaders use 2D simplex noise from [stegu/webgl-noise](https://github.com/stegu/webgl-noise)
(Ian McEwan, Ashima Arts; MIT licence), vendored in `render/gl/shaders/noise.ts` with its licence. The helicopter's shader
(`render/gl/shaders/chopper.ts`) uses the same noise.
