window.Makyek = window.Makyek || {};

window.Makyek.createGame = function createGame(initialLevel = null) {
  let level = initialLevel;
  let board = window.Makyek.createInitialBoard(level);
  let currentPlayer = "light";
  let winner = null;
  let darkCanMove = level ? level.darkCanMove : true;

  return {
    get board() {
      return board;
    },

    get currentPlayer() {
      return currentPlayer;
    },

    get winner() {
      return winner;
    },

    get helpText() {
      return level ? level.helpText : "";
    },

    get darkCanMove() {
      return darkCanMove;
    },

    reset(nextLevel = level) {
      level = nextLevel;
      board = window.Makyek.createInitialBoard(level);
      currentPlayer = "light";
      winner = null;
      darkCanMove = level ? level.darkCanMove : true;
    },

    canMoveFrom(from) {
      if (!isInsideBoard(from) || winner) {
        return false;
      }

      const piece = board[from.row][from.col];
      if (piece === "#") {
        return false;
      }

      if (piece !== currentPlayer) {
        return false;
      }

      return window.Makyek.getLegalMoves(board, from).length > 0;
    },

    getLegalMoves(player = currentPlayer) {
      if (winner) {
        return [];
      }

      return window.Makyek.getAllLegalMoves(board, player);
    },

    movePiece(from, to) {
      if (winner) {
        return { ok: false, message: `${playerName(winner)} has already won.` };
      }

      if (!isInsideBoard(from) || !isInsideBoard(to)) {
        return { ok: false, message: "That move is outside the board." };
      }

      const piece = board[from.row][from.col];
      if (!piece || piece === "#") {
        return { ok: false, message: "Choose a square with a piece." };
      }

      if (piece !== currentPlayer) {
        return { ok: false, message: `${playerName(currentPlayer)} to move.` };
      }

      const validation = validateRookMove(board, from, to);
      if (!validation.ok) {
        return validation;
      }

      const moveResult = window.Makyek.applyMove(board, { from, to }, piece);
      board = moveResult.board;
      const fromLabel = squareLabel(from);
      const toLabel = squareLabel(to);
      const opponent = otherPlayer(piece);

      if (moveResult.winner) {
        winner = piece;
        return {
          ok: true,
          message: `${playerName(piece)} moved from ${fromLabel} to ${toLabel}, ${captureMessage(moveResult.captured)}, and won.`,
          capturedSquares: moveResult.capturedSquares,
        };
      }

      currentPlayer = opponent;

      if (currentPlayer === "dark" && !darkCanMove) {
        currentPlayer = piece;

        return {
          ok: true,
          message: `${playerName(piece)} moved from ${fromLabel} to ${toLabel} and ${captureMessage(moveResult.captured)}. Goblins stay put. ${playerName(currentPlayer)} to move.`,
          capturedSquares: moveResult.capturedSquares,
        };
      }

      return {
        ok: true,
        message: `${playerName(piece)} moved from ${fromLabel} to ${toLabel} and ${captureMessage(moveResult.captured)}. ${playerName(currentPlayer)} to move.`,
        capturedSquares: moveResult.capturedSquares,
      };
    },
  };
};

const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const AXES = [
  [
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ],
  [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
  ],
];

window.Makyek.getLegalMoves = function getLegalMoves(board, from) {
  const moves = [];

  DIRECTIONS.forEach((direction) => {
    let row = from.row + direction.row;
    let col = from.col + direction.col;

    while (isInsideBoard({ row, col }) && !board[row][col]) {
      moves.push({ row, col });
      row += direction.row;
      col += direction.col;
    }
  });

  return moves;
};

window.Makyek.getAllLegalMoves = function getAllLegalMoves(board, player) {
  const moves = [];

  board.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (piece !== player) {
        return;
      }

      window.Makyek.getLegalMoves(board, { row: rowIndex, col: colIndex }).forEach((to) => {
        moves.push({
          from: { row: rowIndex, col: colIndex },
          to,
        });
      });
    });
  });

  return moves;
};

window.Makyek.applyMove = function applyMove(board, move, player) {
  const nextBoard = cloneBoard(board);

  nextBoard[move.to.row][move.to.col] = player;
  nextBoard[move.from.row][move.from.col] = null;

  const capturedSquares = capturePieces(nextBoard, move.to, player);
  const opponent = otherPlayer(player);

  return {
    board: nextBoard,
    captured: capturedSquares.length,
    capturedSquares,
    winner: countPieces(nextBoard, opponent) === 0 ? player : null,
  };
};

window.Makyek.otherPlayer = otherPlayer;
window.Makyek.countPieces = countPieces;
window.Makyek.squareLabel = squareLabel;

function validateRookMove(board, from, to) {
  if (from.row === to.row && from.col === to.col) {
    return { ok: false, message: "Move to a different square." };
  }

  if (board[to.row][to.col]) {
    return { ok: false, message: "Drop onto an empty square." };
  }

  const isHorizontal = from.row === to.row;
  const isVertical = from.col === to.col;

  if (!isHorizontal && !isVertical) {
    return { ok: false, message: "Move horizontally or vertically." };
  }

  const rowStep = Math.sign(to.row - from.row);
  const colStep = Math.sign(to.col - from.col);
  let row = from.row + rowStep;
  let col = from.col + colStep;

  while (row !== to.row || col !== to.col) {
    if (board[row][col]) {
      return { ok: false, message: "Pieces cannot move through other pieces." };
    }

    row += rowStep;
    col += colStep;
  }

  return { ok: true };
}

function capturePieces(board, movedTo, player) {
  const captured = [];

  AXES.forEach((axis) => {
    const custodianCaptures = getCustodianCaptures(board, movedTo, player, axis);

    if (custodianCaptures.length > 0) {
      captured.push(...custodianCaptures);
      return;
    }

    captured.push(...getInterventionCaptures(board, movedTo, player, axis));
  });

  captured.forEach((square) => {
    board[square.row][square.col] = null;
  });

  return captured;
}

function getCustodianCaptures(board, movedTo, player, axis) {
  const captures = [];

  axis.forEach((direction) => {
    captures.push(...getCustodianLineCaptures(board, movedTo, player, direction));
  });

  return captures;
}

function getCustodianLineCaptures(board, movedTo, player, direction) {
  const opponent = otherPlayer(player);
  const captures = [];
  let square = offsetSquare(movedTo, direction, 1);

  while (isInsideBoard(square) && board[square.row][square.col] === opponent) {
    captures.push(square);
    square = offsetSquare(square, direction, 1);
  }

  if (
    captures.length > 0 &&
    isInsideBoard(square) &&
    board[square.row][square.col] === player
  ) {
    return captures;
  }

  return [];
}

function getInterventionCaptures(board, movedTo, player, axis) {
  const opponent = otherPlayer(player);
  const firstEnemy = offsetSquare(movedTo, axis[0], 1);
  const secondEnemy = offsetSquare(movedTo, axis[1], 1);

  if (
    isInsideBoard(firstEnemy) &&
    isInsideBoard(secondEnemy) &&
    board[firstEnemy.row][firstEnemy.col] === opponent &&
    board[secondEnemy.row][secondEnemy.col] === opponent
  ) {
    return [firstEnemy, secondEnemy];
  }

  return [];
}

function offsetSquare(square, direction, distance) {
  return {
    row: square.row + direction.row * distance,
    col: square.col + direction.col * distance,
  };
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
  const boardRows = window.Makyek.BOARD_ROWS;
  const boardCols = window.Makyek.BOARD_COLS;

  return (
    square &&
    square.row >= 0 &&
    square.row < boardRows &&
    square.col >= 0 &&
    square.col < boardCols
  );
}

function otherPlayer(player) {
  return player === "light" ? "dark" : "light";
}

function playerName(player) {
  return player === "light" ? "Light" : "Dark";
}

function captureMessage(captured) {
  return `captured ${captured} ${captured === 1 ? "piece" : "pieces"}`;
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
