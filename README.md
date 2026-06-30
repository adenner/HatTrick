# Hat Trick

A browser-based Snood / Puzzle Bobble clone where you shoot hats instead of bubbles.  Built with TypeScript and the HTML5 Canvas API — no external game framework.

## How to Play

- **Move the mouse** to aim the shooter at the bottom of the screen.
- **Click** to fire a hat upward.
- When a fired hat connects to a cluster and **3 or more matching hats** are touching, they all pop and are removed.
- Hats that lose connection to the ceiling **fall and score bonus points**.
- The game ends if the hat cluster descends past the **danger line** (dashed red).
- Clear all hats to **win**.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Mouse move | Aim the shooter |
| Left click | Fire the current hat |
| Touch move | Aim (mobile) |
| Touch tap | Fire (mobile) |
| P | Pause / Resume |
| Escape | Pause / Resume |
| M | Toggle audio mute |
| C | Toggle targeting-assist cheat overlay |

## Game Mechanics

### Hex Grid

The playing field uses **offset hex coordinates**.  Even rows have 13 columns; odd rows have 12 columns offset rightward by one hat radius.  Row height is `diameter × sin(60°) ≈ 41.6 px` so hat circles tessellate without gaps or overlaps.

Cell neighbours depend on row parity:

| Neighbour direction | Even row (`r`) | Odd row (`r`) |
|---|---|---|
| Left / Right | `(r, c−1)` / `(r, c+1)` | `(r, c−1)` / `(r, c+1)` |
| Upper-left / Upper-right | `(r−1, c−1)` / `(r−1, c)` | `(r−1, c)` / `(r−1, c+1)` |
| Lower-left / Lower-right | `(r+1, c−1)` / `(r+1, c)` | `(r+1, c)` / `(r+1, c+1)` |

### BFS Match Detection

After a hat snaps into the grid, a breadth-first flood-fill from the landing cell visits every neighbour of the same hat type.  If the resulting connected group contains `>= MIN_MATCH_COUNT` (3) hats, the entire group is removed from the grid.

### Disconnection Detection

After a match is removed, a second BFS seeds itself from **all hats in row 0** (the ceiling row) and marks every reachable hat as "connected".  Any hat not reached is floating and is also removed, converted to a falling particle, and scores bonus points.

### Scoring

| Event | Points |
|---|---|
| Each matched hat | 100 × combo |
| Each fallen (disconnected) hat | 50 × combo |

The combo multiplier starts at 1, increments by 1 on each consecutive successful pop, caps at 8, and resets to 1 when a shot fails to form a match.

### Targeting Assist (press C)

When enabled, the game runs a physics simulation each aim frame to predict where the current shot will land.  It temporarily places a ghost hat at that cell, runs the BFS match search, and draws:
- A ghost hat sprite at the predicted landing cell.
- Glowing rings around every hat in the would-be matched group — green when the group will pop (`>= 3`), amber when it will not.
- A badge showing the group size, prefixed with `✓` when a pop will occur.

The simulation uses the same physics as the live projectile, stepped up to 600 iterations to project far enough to find a landing cell.

## Hat Types

| Hat | Dominant Colour | Glow Colour |
|---|---|---|
| Top Hat | Black | Grey |
| Fedora | Brown / Tan | Gold |
| Cowboy Hat | Gold / Tan | Yellow |
| Witch Hat | Purple | Violet |
| Baseball Cap | Red | Red |
| Beret | Teal | Cyan |
| Propeller Hat | Green | Green |

## Architecture

### Data-Flow Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│                                                                   │
│  Mouse / Touch / Keyboard                                         │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────────┐                                             │
│  │   InputHandler   │  Translates raw DOM events into            │
│  │  (canvas events) │  shoot(x,y) / aim(x,y) / key(k) callbacks │
│  └────────┬─────────┘                                             │
│           │                                                       │
│           ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                         Game                            │     │
│  │                     (RAF loop)                          │     │
│  │                                                          │     │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │     │
│  │  │  Grid    │    │ Shooter  │    │   Projectile     │  │     │
│  │  │ (hex BFS │◄───│ (angle + │───►│ (physics + wall  │  │     │
│  │  │  match / │    │  queue)  │    │  bounce +        │  │     │
│  │  │  discnct)│    └──────────┘    │  collision)      │  │     │
│  │  └──────────┘                    └────────┬─────────┘  │     │
│  │       ▲  snap + resolve on collision      │             │     │
│  │       └───────────────────────────────────┘             │     │
│  │                                                          │     │
│  │  ┌──────────┐    ┌──────────────┐                       │     │
│  │  │ scoring  │    │ SoundEngine  │                       │     │
│  │  │ (pure fn)│    │ (Web Audio)  │                       │     │
│  │  └──────────┘    └──────────────┘                       │     │
│  │                                                          │     │
│  │       buildRenderState() ──► RenderState (snapshot)     │     │
│  └───────────────────────────────────┬──────────────────────┘     │
│                                      │                            │
│                                      ▼                            │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                       Renderer                           │    │
│  │  background → danger line → grid hats → falling hats →  │    │
│  │  aim line → targeting overlay → shooter → projectile →  │    │
│  │  HUD → phase overlay (pause / win / lose)                │    │
│  └───────────────────────────────────┬───────────────────────┘    │
│                                      │  Canvas 2D API             │
│                                      ▼                            │
│                             <canvas> element                      │
└───────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

- **Render state is a pure snapshot.** `Game.buildRenderState()` assembles a plain `RenderState` value each frame.  The `Renderer` reads it and never mutates game state, so the two layers are independently testable.
- **Subsystems are single-responsibility.** `Grid` knows nothing about pixels; `Renderer` knows nothing about game rules; `InputHandler` knows nothing about game phases.
- **Assets are pre-rasterised.** `HatRenderer` renders every hat sprite to an `OffscreenCanvas` at startup and caches the result as an `ImageBitmap`.  Per-frame drawing is a single `drawImage` call per hat.
- **No external dependencies.** Everything is built on the Canvas 2D API, Web Audio API, and standard TypeScript.

## Key Files

| File | Description |
|---|---|
| `src/types.ts` | Enums (`HatType`, `GamePhase`), shared interfaces (`GridPos`, `FallingHat`), and all game constants |
| `src/main.ts` | Entry point — constructs `Game`, calls `init()` and `start()` |
| `src/game/Game.ts` | Top-level orchestrator: RAF loop, state machine, input routing, snap-and-resolve logic |
| `src/game/Grid.ts` | Hex grid data structure, BFS match detection, disconnection sweep, pixel/cell conversions |
| `src/game/Projectile.ts` | Hat projectile physics, wall bouncing, hat-collision detection, aim-line and landing simulation |
| `src/game/Shooter.ts` | Manages aim angle (with clamp) and the two-hat lookahead queue |
| `src/game/scoring.ts` | Pure functions for computing shot points and updating the combo multiplier |
| `src/render/Renderer.ts` | Canvas 2D drawing layer — background, grid, HUD, and phase overlays; reads `RenderState` only |
| `src/render/HatRenderer.ts` | Pre-renders SVG path layer data to `OffscreenCanvas` bitmaps at startup for fast blitting |
| `src/sprites/hats.ts` | SVG path layer definitions and glow colours for all 7 hat types |
| `src/input/InputHandler.ts` | Attaches mouse and touch listeners to the canvas; normalises coordinates to canvas space |
| `src/audio/SoundEngine.ts` | Web Audio API engine — synthesises bounce, shoot, match, fall, win, and lose sounds |

## Development

### Prerequisites

Node.js 18+ and npm.

### Setup

```bash
npm install
```

### Development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Run tests

```bash
npm test
```

Tests cover `Grid` (BFS match + disconnect), `Projectile` (physics, collision), `Shooter` (angle clamping, queue), and `scoring` (points, combo calculation).

### Production build

```bash
npm run build
```

Output is in `dist/`.

## Container (Podman)

Two `Containerfile`s are provided. Podman is drop-in compatible with Docker — swap `podman` for `docker` if preferred.

### Dev server (Vite + HMR)

Build once, then run with source directories mounted so Vite picks up edits
without a container rebuild:

```bash
podman build -f Containerfile.dev -t hat-trick-dev .

podman run --rm -p 5173:5173 \
  -v ./src:/app/src:z \
  -v ./index.html:/app/index.html:z \
  hat-trick-dev
```

Open [http://localhost:5173](http://localhost:5173).  Edit files in `src/` and
the browser reloads automatically via Vite HMR.

> The `:z` flag relabels the volume for SELinux (required on Fedora / RHEL).
> Drop it on macOS or non-SELinux Linux hosts.

To run without live-mount (snapshot of current source):

```bash
podman run --rm -p 5173:5173 hat-trick-dev
```

### Production build (nginx)

Multi-stage build: TypeScript + Vite compile in a Node image, then the
compiled `dist/` is served by a minimal `nginx:alpine` image.

```bash
podman build -t hat-trick .
podman run --rm -p 8080:80 hat-trick
```

Open [http://localhost:8080](http://localhost:8080).
