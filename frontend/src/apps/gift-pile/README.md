# 嘉年华堆堆乐 (Gift Pile)

## TODO

- Move the physics to a WASM engine (Rapier, `@dimforge/rapier2d`) once the rules outgrow the hand-rolled one, running in a Web Worker with interpolated drawing. Keep taking icons out of the engine once they settle, so it only ever holds what is moving.
- Drag an icon into a rubbish bin to destroy it. Only what it was holding up needs to move again: wake the resting icons touching it from above, and let each one that starts moving wake the ones resting on it in turn. Repaint only that part of the resting layer.
- A vacuum at the mouse for about a second, pulling nearby icons in. Icons need a velocity in any direction for this, not just a speed along their way down.
- A blast that destroys every icon in range: the same as the rubbish bin for many icons at once, found through the grid, with the icons around the hole woken.
