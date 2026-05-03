# Agent Notes

## Project Goal

Build a playable browser version of Mak-yek using HTML, CSS, JavaScript, and image assets.

## Current Priorities

- Keep the project simple and browser-runnable.
- Prefer plain JavaScript unless a library is clearly useful.
- Keep game rules separate from rendering/UI.
- The first playable slice is an 8 by 7 board with draggable circular pieces.

## Architecture Notes

- `src/rules.js`: board constants, initial setup, and eventually pure move/capture rules.
- `src/game.js`: game state and turn flow.
- `src/renderer.js`: board drawing and DOM updates.
- `src/input.js`: mouse, touch, and keyboard handling when this grows past native drag/drop.
- `assets/images/`: image assets when pieces or board art are introduced.

## Open Questions

- Exact Mak-yek rule variant?
- Single-player AI later, or local two-player first?
- DOM board, canvas, or hybrid rendering?
