# Hat Trick

A browser-based Snood / Puzzle Bobble clone where you shoot hats instead of bubbles. Built with TypeScript and the HTML5 Canvas API — no external game framework.

## How to Play

- **Move the mouse** to aim the shooter at the bottom of the screen.
- **Click** to fire a hat upward.
- When a fired hat connects to a cluster and **3 or more matching hats** are touching, they all pop and are removed.
- Hats that lose connection to the ceiling **fall and score bonus points**.
- The game ends if the hat cluster descends past the **danger line** (dashed red).
- Clear all hats to **win**.

### Scoring

| Event | Points |
|---|---|
| Each matched hat | 100 × combo |
| Each fallen hat | 50 × combo |

The combo multiplier increments each consecutive successful pop (max ×8) and resets on a miss.

### Controls

| Input | Action |
|---|---|
| Mouse move | Aim |
| Left click | Fire |
| Touch move | Aim (mobile) |
| Touch tap | Fire (mobile) |
| P / Escape | Pause / Resume |

## Hat Types

| Hat | Color |
|---|---|
| Top Hat | Black |
| Fedora | Brown |
| Cowboy Hat | Gold |
| Witch Hat | Purple |
| Baseball Cap | Red |
| Beret | Teal |
| Propeller Hat | Green |

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

### Production build

```bash
npm run build
```

Output is in `dist/`.

## Architecture

```
src/
├── types.ts              — Enums, interfaces, game constants
├── main.ts               — Entry point
├── sprites/
│   └── hats.ts           — SVG layer data for all 7 hat types
├── game/
│   ├── Grid.ts           — Hexagonal grid, BFS match/disconnect detection
│   ├── Projectile.ts     — Physics, wall bounce, collision
│   ├── Shooter.ts        — Aim angle, hat queue
│   ├── scoring.ts        — Pure score calculation functions
│   └── Game.ts           — Game loop (RAF), state machine, snap-and-resolve
├── render/
│   ├── HatRenderer.ts    — Pre-renders SVG hat sprites to OffscreenCanvas
│   └── Renderer.ts       — Canvas drawing: grid, shooter, HUD, overlays
├── input/
│   └── InputHandler.ts   — Mouse and touch event handling
└── __tests__/
    ├── Grid.test.ts
    ├── Projectile.test.ts
    ├── Shooter.test.ts
    └── scoring.test.ts
```

### Grid System

The playing field uses **hex offset coordinates**. Even rows have 13 columns; odd rows have 12 (offset right by one radius). Row height is `diameter × sin(60°) ≈ 41.6 px` so hats tessellate correctly.

Adjacency rules:
- Same row: `(r, c±1)`
- Even row diagonals: `(r±1, c−1)` and `(r±1, c)`
- Odd row diagonals: `(r±1, c)` and `(r±1, c+1)`

Match detection and disconnection detection both use BFS flood-fill. Disconnected hats are found by seeding BFS from all row-0 hats and marking everything unreachable as floating.

### Hat Rendering

Each hat is defined as layered SVG path strings (`d` attributes) centered at the origin in a 48×48 viewBox. At startup `HatRenderer` pre-renders each type onto an `OffscreenCanvas` (scaled to the actual `HAT_RADIUS`) and caches the result as an `ImageBitmap` for fast `drawImage` calls during gameplay.
