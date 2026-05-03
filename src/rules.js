window.Makyek = window.Makyek || {};

window.Makyek.BOARD_ROWS = 7;
window.Makyek.BOARD_COLS = 8;
window.Makyek.BOARD_SIZE = window.Makyek.BOARD_COLS;

window.Makyek.createInitialBoard = function createInitialBoard(level) {
  if (level && level.board) {
    return level.board.map((row) => row.slice());
  }

  const boardRows = window.Makyek.BOARD_ROWS;
  const boardCols = window.Makyek.BOARD_COLS;

  return Array.from({ length: boardRows }, (_, row) =>
    Array.from({ length: boardCols }, (_, col) => createInitialPiece(row, col)),
  );
};

function createInitialPiece(row, col) {
  if (col === 0 || col === 2) {
    return "light";
  }

  if (col === 5 || col === 7) {
    return "dark";
  }

  return null;
}
