window.Makyek = window.Makyek || {};

window.Makyek.forEachSquare = function forEachSquare(board, callback) {
  board.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      callback(piece, { row: rowIndex, col: colIndex });
    });
  });
};
