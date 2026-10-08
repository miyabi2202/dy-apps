# AGENTS.md

The [apps AGENTS.md](../AGENTS.md) and the [root AGENTS.md](../../../../AGENTS.md) apply here
too. The [README](README.md) says how each part works.

## Modules and who may use whom

The gift pile has four modules. Only the controller knows about the others. The others never
refer to each other: whatever one needs from another, the controller hands it over.

| Module             | What it is                                                                                                                              | May use                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Controller**     | `pile.ts`, which owns the camera (`render/camera.ts`) and where every icon is (`render/pile-state.ts`). Built once by `create-pile.ts`. | All the other modules                                                                                      |
| **Physics engine** | `core/`, run in the worker (`pile-worker.ts`) and reached through `pile-client.ts`                                                      | Nothing outside `core/`                                                                                    |
| **Renderer**       | `render/gl-renderer.ts` and `render/gl/` (WebGL2), `render/sprite.ts`                                                                   | Only what the controller passes it each draw (the icons, the view)                                         |
| **Removers**       | `removal/`: the director, and each remover in its own folder                                                                            | Only their `Board` (`removal/board.ts`), which the controller provides; a remover also uses `removal/kit/` |

The page and its UI (`gift-pile-page.tsx`, `ui/`) talk only to the controller.

## Rules

- **Physics engine.** Hear from the engine only through its frames, and command it only
  through the controller. It knows nothing of the camera or of drawing: it is told where to drop
  new icons, and keeps its own rule never to release one into its heap.
- **Renderer.** Only draws. It holds no camera, removers or engine of its own.
- **Removers.** Draw only through the `Gfx` they are handed (`render/gfx.ts`), never GL. See the pile only through their `Board`. To give them something new, add it to
  `Board` and to the controller's side of it, never a way round it.
- **Camera.** Only the camera decides where the view goes. Priority: the user, then a removal's
  request, then following the pile.
- **Every frame.** Positions and the camera change every frame, so they stay out of React.
  They also stay in their typed arrays: the pile can hold 100,000 icons.
