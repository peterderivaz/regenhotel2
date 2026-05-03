window.Makyek = window.Makyek || {};

window.Makyek.createGame = function createGame(initialLevel = null) {
  let level = initialLevel;
  let board = window.Makyek.createInitialBoard(level);
  let originalFilips = markOriginalFilips(board);
  let placedFilips = [];
  let placeLimit = getPlaceLimit(level, board);
  let phase = "placing";
  let winner = null;
  let boardBeforeRegen = null;

  return {
    get board() {
      return board;
    },

    get phase() {
      return phase;
    },

    get winner() {
      return winner;
    },

    get helpText() {
      return level ? level.helpText : "";
    },

    get placedFilips() {
      return placedFilips.slice();
    },

    get remainingPlacements() {
      return Math.max(0, placeLimit - placedFilips.length);
    },

    get placeLimit() {
      return placeLimit;
    },

    get darkCanMove() {
      return false;
    },

    get currentPlayer() {
      return "light";
    },

    reset(nextLevel = level) {
      level = nextLevel;
      board = window.Makyek.createInitialBoard(level);
      originalFilips = markOriginalFilips(board);
      placedFilips = [];
      placeLimit = getPlaceLimit(level, board);
      phase = "placing";
      winner = null;
      boardBeforeRegen = null;
    },

    canPlaceAt(square) {
      return canPlaceAt(board, square) && phase === "placing" && placedFilips.length < placeLimit;
    },

    isPlacedFilip(square) {
      return placedFilips.some((placed) => sameSquare(placed, square));
    },

    isOriginalFilip(square) {
      return originalFilips.has(squareKey(square));
    },

    toggleFilip(square) {
      if (phase !== "placing") {
        return { ok: false, message: "Click to reset." };
      }

      if (!isInsideBoard(square) || board[square.row][square.col] === "#") {
        return { ok: false, message: "Choose a hotel room." };
      }

      if (board[square.row][square.col] === "light") {
        if (originalFilips.has(squareKey(square))) {
          return { ok: false, message: "Original Filips stay where they are." };
        }

        placedFilips = placedFilips.filter((placed) => !sameSquare(placed, square));
        board[square.row][square.col] = null;
        return {
          ok: true,
          message: placementMessage(placeLimit - placedFilips.length),
        };
      }

      if (board[square.row][square.col]) {
        return { ok: false, message: "That room is occupied." };
      }

      if (placedFilips.length >= placeLimit) {
        return { ok: false, message: "All Filips are placed." };
      }

      board[square.row][square.col] = "light";
      placedFilips.push({ row: square.row, col: square.col });

      if (placedFilips.length === placeLimit) {
        phase = "regen";
        boardBeforeRegen = cloneBoard(board);
        return {
          ok: true,
          readyToRegen: true,
          message: "Regeneration begins.",
        };
      }

      return {
        ok: true,
        message: placementMessage(placeLimit - placedFilips.length),
      };
    },

    movePlacedFilip(from, to) {
      if (phase !== "placing") {
        return { ok: false, message: "Click to reset." };
      }

      if (!isInsideBoard(from) || !isInsideBoard(to)) {
        return { ok: false, message: "Choose a hotel room." };
      }

      if (sameSquare(from, to)) {
        return { ok: true, message: placementMessage(placeLimit - placedFilips.length) };
      }

      if (!placedFilips.some((placed) => sameSquare(placed, from))) {
        return { ok: false, message: "Drag a placed Filip." };
      }

      if (originalFilips.has(squareKey(from))) {
        return { ok: false, message: "Original Filips stay where they are." };
      }

      if (board[to.row][to.col]) {
        return { ok: false, message: "That room is occupied." };
      }

      board[from.row][from.col] = null;
      board[to.row][to.col] = "light";
      placedFilips = placedFilips.map((placed) => (
        sameSquare(placed, from)
          ? { row: to.row, col: to.col }
          : placed
      ));

      return {
        ok: true,
        message: placementMessage(placeLimit - placedFilips.length),
      };
    },

    getNextRegenStep() {
      if (phase !== "regen") {
        return null;
      }

      return getNextRegenStep(board);
    },

    applyRegenStep(step) {
      if (!step || phase !== "regen") {
        return { ok: false, message: "No regeneration to apply." };
      }

      step.changes.forEach((change) => {
        board[change.square.row][change.square.col] = change.to;
      });

      return {
        ok: true,
        message: `Regenerated ${step.changes.length} ${step.changes.length === 1 ? "room" : "rooms"}.`,
      };
    },

    finishRegen() {
      if (isAllFilips(board)) {
        winner = "light";
        phase = "won";
        return { won: true, message: "Brilliant work." };
      }

      phase = "failed";
      return { won: false, message: "Click to reset." };
    },

    undoLastPlacement() {
      const lastPlaced = placedFilips.pop();

      if (boardBeforeRegen) {
        board = cloneBoard(boardBeforeRegen);
        boardBeforeRegen = null;
      }

      if (lastPlaced && board[lastPlaced.row][lastPlaced.col] === "light") {
        board[lastPlaced.row][lastPlaced.col] = null;
      }

      phase = "placing";
      winner = null;
      return {
        ok: true,
        message: placementMessage(placeLimit - placedFilips.length),
      };
    },

    canMoveFrom() {
      return false;
    },

    getLegalMoves() {
      return [];
    },

    movePiece() {
      return { ok: false, message: "Place Filips to start regeneration." };
    },
  };
};

const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

window.Makyek.getNextRegenStep = getNextRegenStep;
window.Makyek.countPieces = countPieces;
window.Makyek.squareLabel = squareLabel;

function getNextRegenStep(board) {
  const changes = [];

  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === "#") {
        return;
      }

      const square = { row: rowIndex, col: colIndex };
      const adjacentCounts = countAdjacentPieces(board, square);

      if (!cell) {
        const nextPiece = adjacentCounts.light >= 2 && adjacentCounts.dark < 2
          ? "light"
          : adjacentCounts.dark >= 2 && adjacentCounts.light < 2
            ? "dark"
            : null;

        if (nextPiece) {
          changes.push({ square, from: null, to: nextPiece });
        }
        return;
      }

      if (cell === "dark" && adjacentCounts.light >= 2) {
        changes.push({ square, from: "dark", to: "light" });
      }
    });
  });

  return changes.length > 0 ? { changes } : null;
}

function countAdjacentPieces(board, square) {
  return DIRECTIONS.reduce(
    (counts, direction) => {
      const row = square.row + direction.row;
      const col = square.col + direction.col;

      if (!isInsideBoard({ row, col })) {
        return counts;
      }

      const piece = board[row][col];

      if (piece === "light" || piece === "dark") {
        counts[piece] += 1;
      }

      return counts;
    },
    { light: 0, dark: 0 },
  );
}

function canPlaceAt(board, square) {
  return isInsideBoard(square) && !board[square.row][square.col];
}

function isAllFilips(board) {
  return board.every((row) => row.every((cell) => cell === "#" || cell === "light"));
}

function markOriginalFilips(board) {
  const originals = new Set();

  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === "light") {
        originals.add(squareKey({ row: rowIndex, col: colIndex }));
      }
    });
  });

  return originals;
}

function getPlaceLimit(level, board) {
  if (level && Number.isInteger(level.placeLimit)) {
    return level.placeLimit;
  }

  return Math.floor((activeColumnCount(board) + activeRowCount(board)) / 2);
}

function activeRowCount(board) {
  return board.filter((row) => row.some((cell) => cell !== "#")).length || window.Makyek.BOARD_ROWS;
}

function activeColumnCount(board) {
  let count = 0;

  for (let col = 0; col < window.Makyek.BOARD_COLS; col += 1) {
    if (board.some((row) => row[col] !== "#")) {
      count += 1;
    }
  }

  return count || window.Makyek.BOARD_COLS;
}

function countPieces(board, player) {
  return board.reduce(
    (total, row) => total + row.filter((piece) => piece === player).length,
    0,
  );
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function isInsideBoard(square) {
  return (
    square &&
    square.row >= 0 &&
    square.row < window.Makyek.BOARD_ROWS &&
    square.col >= 0 &&
    square.col < window.Makyek.BOARD_COLS
  );
}

function sameSquare(firstSquare, secondSquare) {
  return firstSquare.row === secondSquare.row && firstSquare.col === secondSquare.col;
}

function squareKey(square) {
  return `${square.row},${square.col}`;
}

function placementMessage(remaining) {
  return `${remaining} ${remaining === 1 ? "Filip" : "Filips"} left to place.`;
}

function squareLabel(square) {
  if (
    !square ||
    !Number.isInteger(square.row) ||
    !Number.isInteger(square.col)
  ) {
    return "unknown square";
  }

  return `${String.fromCharCode(65 + square.col)}${window.Makyek.BOARD_ROWS - square.row}`;
}
