# Mak-yek

A browser-based Mak-yek game built with plain HTML, CSS, JavaScript, and image assets.

## Running

Serve the project directory with a local web server, then open `index.html`.
White thinking uses a Web Worker, which many browsers block from `file://` pages.

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Project Layout

- `index.html` - application shell.
- `styles/main.css` - visual styling.
- `src/` - JavaScript modules.
- `assets/` - images, sprites, icons, and audio.
- `docs/` - agent notes, design notes, and task tracking.
