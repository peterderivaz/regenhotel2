# LEVEL DESIGN

- Levels are stored in text files in assets/levels
- Initial lines end with full stop and show help text to be shown
- Remaining lines show 8x7 grid
- # squares are impassable and should be cropped out of the game (not shown)
- F is starting squares for Filip
- g or G are starting squares for goblins
- If there are no G squares, then the goblins do not move and skip their turn
- After grid can set depth=3 to indicate black AI depth, default to 2
