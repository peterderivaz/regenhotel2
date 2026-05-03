window.Makyek = window.Makyek || {};

const HOTEL_BOARD_COLUMNS = [7.6, 18.5, 29.8, 41.0, 58.8, 70.4, 81.9, 93.0];
const HOTEL_BOARD_ROWS = [9.4, 23.3, 37.5, 51.6, 65.6, 79.2, 91.4];
const FULL_BOARD_VIEWPORT = { left: 0, top: 0, width: 100, height: 100 };
let currentViewport = FULL_BOARD_VIEWPORT;
let draggedSquare = null;
let selectedSquare = null;

["light", "dark"].forEach((piece) => {
  [false, true].forEach((isCaptured) => {
    const image = new Image();
    image.src = getPieceImage(piece, isCaptured);
  });
});

window.Makyek.renderBoard = function renderBoard({
  boardElement,
  statusElement,
  game,
  onMove,
  onMoveStart,
  inputBlocked,
  analysisMoves = [],
  hoverMoves = [],
}) {
  selectedSquare = null;
  boardElement.replaceChildren();

  const boardRows = Math.min(game.board.length, HOTEL_BOARD_ROWS.length);
  const boardCols = Math.min(game.board[0].length, HOTEL_BOARD_COLUMNS.length);
  currentViewport = getBoardViewport(game.board, boardRows, boardCols);
  applyBoardViewport(boardElement, currentViewport);

  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      const square = createSquare(row, col, currentViewport);
      const piece = game.board[row][col];

      if (piece === "#") {
        continue;
      }

      const canMove = !inputBlocked && piece && game.canMoveFrom({ row, col });
      addSquareHandlers(square, onMove, inputBlocked, game);

      if (piece) {
        square.append(createPiece(piece, row, col, statusElement, canMove, onMoveStart, game));
      }

      boardElement.append(square);
    }
  }

  if (analysisMoves.length > 0) {
    boardElement.append(createMoveArrows(analysisMoves, "move-arrows"));
  }

  if (hoverMoves.length > 0) {
    boardElement.append(createMoveArrows(hoverMoves, "move-arrows hover-arrows"));
  }
};

window.Makyek.animateAiMove = function animateAiMove(boardElement, move, capturedSquares = []) {
  const fromSquare = findSquare(boardElement, move.from);
  const toSquare = findSquare(boardElement, move.to);
  const movingPiece = fromSquare ? fromSquare.querySelector(".piece") : null;

  if (!fromSquare || !toSquare || !movingPiece) {
    return Promise.resolve();
  }

  const fromRect = movingPiece.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();
  const boardRect = boardElement.getBoundingClientRect();
  const clone = movingPiece.cloneNode(true);
  const deltaX = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const deltaY = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  clone.classList.add("ai-moving-piece");
  clone.style.left = `${fromRect.left - boardRect.left}px`;
  clone.style.top = `${fromRect.top - boardRect.top}px`;
  clone.style.width = `${fromRect.width}px`;
  clone.style.height = `${fromRect.height}px`;
  movingPiece.classList.add("ai-source-piece");
  boardElement.append(clone);

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      clone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });

    window.setTimeout(() => {
      markCapturedPieces(boardElement, capturedSquares);
    }, 170);

    window.setTimeout(() => {
      movingPiece.classList.remove("ai-source-piece");
      clone.remove();
      resolve();
    }, capturedSquares.length > 0 ? 560 : 360);
  });
};

function createSquare(row, col, viewport) {
  const square = document.createElement("div");
  square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
  square.dataset.row = row;
  square.dataset.col = col;
  square.style.setProperty("--cell-x", `${viewportCoordinate(HOTEL_BOARD_COLUMNS[col], viewport.left, viewport.width)}%`);
  square.style.setProperty("--cell-y", `${viewportCoordinate(HOTEL_BOARD_ROWS[row], viewport.top, viewport.height)}%`);
  square.style.setProperty("--cell-scale-x", String(100 / viewport.width));
  square.style.setProperty("--cell-scale-y", String(100 / viewport.height));
  square.setAttribute("role", "gridcell");
  square.setAttribute("aria-label", renderSquareLabel(row, col));
  return square;
}

function createPiece(piece, row, col, statusElement, canMove, onMoveStart, game) {
  const pieceElement = document.createElement("button");
  const pieceImage = document.createElement("img");
  pieceElement.className = `piece ${piece}-piece${canMove ? " movable" : ""}`;
  pieceElement.type = "button";
  pieceElement.draggable = canMove;
  pieceElement.disabled = !canMove;
  pieceElement.dataset.row = row;
  pieceElement.dataset.col = col;
  pieceElement.dataset.player = piece;
  pieceElement.setAttribute("aria-label", `${piece} piece on ${renderSquareLabel(row, col)}`);
  pieceElement.title = `${piece} piece`;
  pieceImage.className = "piece-image";
  pieceImage.src = getPieceImage(piece, false);
  pieceImage.alt = "";
  pieceImage.draggable = false;
  pieceElement.append(pieceImage);

  pieceElement.addEventListener("dragstart", (event) => {
    if (!canMove) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({ row, col }));
    draggedSquare = { row, col };
    pieceElement.classList.add("dragging");
    if (piece === "light") {
      highlightLegalTargets(pieceElement.closest(".board"), game, { row, col });
    }
    if (onMoveStart) {
      onMoveStart();
    }
    statusElement.textContent = `Dragging ${piece} piece from ${renderSquareLabel(row, col)}.`;
  });

  pieceElement.addEventListener("dragend", () => {
    pieceElement.classList.remove("dragging");
    draggedSquare = null;
    clearLegalTargetHighlights(pieceElement.closest(".board"));
    clearCapturePreview(pieceElement.closest(".board"));
  });

  pieceElement.addEventListener("focus", () => {
    if (piece === "light" && canMove) {
      selectPiece(pieceElement.closest(".board"), game, { row, col });
    }
  });

  pieceElement.addEventListener("blur", () => {
    if (!selectedSquare || !sameSquare(selectedSquare, { row, col })) {
      clearLegalTargetHighlights(pieceElement.closest(".board"));
    }
  });

  pieceElement.addEventListener("click", (event) => {
    if (piece !== "light" || !canMove) {
      return;
    }

    event.stopPropagation();
    selectPiece(pieceElement.closest(".board"), game, { row, col });
  });

  return pieceElement;
}

function getPieceImage(piece, isCaptured) {
  const imageName =
    piece === "dark"
      ? isCaptured
        ? "goblin_surprise_transparent_blue.png"
        : "goblin_normal_transparent_blue.png"
      : isCaptured
        ? "filip_surprise_transparent.png"
        : "filip_normal_transparent.png";

  return `assets/images/${imageName}`;
}

function addSquareHandlers(square, onMove, inputBlocked, game) {
  square.addEventListener("dragover", (event) => {
    if (inputBlocked) {
      return;
    }

    event.preventDefault();
    square.classList.add("drop-target");
    clearCapturePreview(square.parentElement);
    previewCaptures(square, game, draggedSquare);
  });

  square.addEventListener("dragleave", () => {
    square.classList.remove("drop-target");
    clearCapturePreview(square.parentElement);
  });

  square.addEventListener("drop", (event) => {
    if (inputBlocked) {
      return;
    }

    event.preventDefault();
    square.classList.remove("drop-target");
    clearLegalTargetHighlights(square.parentElement);
    clearCapturePreview(square.parentElement);

    const from = readDragData(event);
    const to = {
      row: Number(square.dataset.row),
      col: Number(square.dataset.col),
    };

    if (from) {
      onMove(from, to);
    }
  });

  square.addEventListener("click", () => {
    if (inputBlocked || !selectedSquare) {
      return;
    }

    const to = {
      row: Number(square.dataset.row),
      col: Number(square.dataset.col),
    };

    if (!square.classList.contains("legal-target")) {
      return;
    }

    const from = selectedSquare;
    clearSelectedSquare(square.parentElement);
    clearCapturePreview(square.parentElement);
    onMove(from, to);
  });
}

function selectPiece(boardElement, game, square) {
  selectedSquare = square;
  boardElement.querySelectorAll(".selected-square").forEach((selectedElement) => {
    selectedElement.classList.remove("selected-square");
  });
  findSquare(boardElement, square)?.classList.add("selected-square");
  highlightLegalTargets(boardElement, game, square);
}

function clearSelectedSquare(boardElement) {
  selectedSquare = null;
  if (boardElement) {
    boardElement.querySelectorAll(".selected-square").forEach((selectedElement) => {
      selectedElement.classList.remove("selected-square");
    });
  }
  clearLegalTargetHighlights(boardElement);
}

function highlightLegalTargets(boardElement, game, from) {
  clearLegalTargetHighlights(boardElement);

  if (!boardElement || !isSquareOnBoard(from)) {
    return;
  }

  window.Makyek.getLegalMoves(game.board, from).forEach((target) => {
    findSquare(boardElement, target)?.classList.add("legal-target");
  });
}

function clearLegalTargetHighlights(boardElement) {
  if (!boardElement) {
    return;
  }

  boardElement.querySelectorAll(".legal-target").forEach((square) => {
    square.classList.remove("legal-target");
  });
}

function previewCaptures(square, game, from) {
  const capturedSquares = getPreviewCapturedSquares(game, from, {
    row: Number(square.dataset.row),
    col: Number(square.dataset.col),
  });

  capturedSquares.forEach((capturedSquare) => {
    const pieceElement = findSquare(square.parentElement, capturedSquare)?.querySelector(".piece");
    const pieceImage = pieceElement?.querySelector(".piece-image");

    if (!pieceElement || !pieceImage) {
      return;
    }

    pieceImage.src = getPieceImage(pieceElement.dataset.player, true);
    pieceElement.classList.add("capture-preview-piece");
  });
}

function clearCapturePreview(boardElement) {
  if (!boardElement) {
    return;
  }

  boardElement.querySelectorAll(".capture-preview-piece").forEach((pieceElement) => {
    const pieceImage = pieceElement.querySelector(".piece-image");

    if (pieceImage) {
      pieceImage.src = getPieceImage(pieceElement.dataset.player, false);
    }

    pieceElement.classList.remove("capture-preview-piece");
  });
}

function getPreviewCapturedSquares(game, from, to) {
  if (!from || !isSquareOnBoard(from) || !isSquareOnBoard(to)) {
    return [];
  }

  const piece = game.board[from.row]?.[from.col];

  if (!piece || piece === "#" || game.board[to.row][to.col]) {
    return [];
  }

  const isLegalMove = window.Makyek
    .getLegalMoves(game.board, from)
    .some((move) => sameSquare(move, to));

  if (!isLegalMove) {
    return [];
  }

  return window.Makyek.applyMove(game.board, { from, to }, piece).capturedSquares;
}

function isSquareOnBoard(square) {
  return (
    square &&
    Number.isInteger(square.row) &&
    Number.isInteger(square.col) &&
    square.row >= 0 &&
    square.row < window.Makyek.BOARD_ROWS &&
    square.col >= 0 &&
    square.col < window.Makyek.BOARD_COLS
  );
}

function sameSquare(firstSquare, secondSquare) {
  return firstSquare.row === secondSquare.row && firstSquare.col === secondSquare.col;
}

function findSquare(boardElement, square) {
  return boardElement.querySelector(`[data-row="${square.row}"][data-col="${square.col}"]`);
}

function markCapturedPieces(boardElement, capturedSquares) {
  capturedSquares.forEach((square) => {
    const capturedSquare = findSquare(boardElement, square);
    const capturedPiece = capturedSquare ? capturedSquare.querySelector(".piece") : null;

    if (capturedSquare) {
      capturedSquare.classList.add("capture-square");
    }

    if (capturedPiece) {
      const capturedImage = capturedPiece.querySelector(".piece-image");

      if (capturedImage) {
        capturedImage.src = getPieceImage(capturedPiece.dataset.player, true);
      }

      capturedPiece.classList.add("captured-piece");
    }
  });
}

function readDragData(event) {
  const dragData = event.dataTransfer.getData("application/json");

  if (!dragData) {
    return null;
  }

  try {
    return JSON.parse(dragData);
  } catch {
    return null;
  }
}

function createMoveArrows(analysisMoves, className) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  const defs = document.createElementNS(svgNamespace, "defs");
  const marker = document.createElementNS(svgNamespace, "marker");
  const markerPath = document.createElementNS(svgNamespace, "path");

  className.split(" ").forEach((name) => {
    svg.classList.add(name);
  });
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  marker.setAttribute("id", "best-move-arrowhead");
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("refX", "4");
  marker.setAttribute("refY", "2.5");
  marker.setAttribute("orient", "auto");
  markerPath.setAttribute("d", "M0,0 L5,2.5 L0,5 Z");
  markerPath.setAttribute("fill", "#16843a");
  marker.append(markerPath);
  defs.append(marker);
  svg.append(defs);

  analysisMoves.forEach((entry) => {
    const line = document.createElementNS(svgNamespace, "line");
    const title = document.createElementNS(svgNamespace, "title");
    const from = squareCenter(entry.move.from);
    const to = squareCenter(entry.move.to);

    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.setAttribute("stroke", "#16843a");
    line.setAttribute("stroke-width", "1.8");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", "0.86");
    line.setAttribute("marker-end", "url(#best-move-arrowhead)");
    title.textContent = `Depth ${entry.depth}: ${renderSquareLabel(entry.move.from.row, entry.move.from.col)} to ${renderSquareLabel(entry.move.to.row, entry.move.to.col)}`;
    line.append(title);
    svg.append(line);
  });

  return svg;
}

function squareCenter(square) {
  return {
    x: viewportCoordinate(HOTEL_BOARD_COLUMNS[square.col], currentViewport.left, currentViewport.width),
    y: viewportCoordinate(HOTEL_BOARD_ROWS[square.row], currentViewport.top, currentViewport.height),
  };
}

function renderSquareLabel(row, col) {
  return `${String.fromCharCode(65 + col)}${(window.Makyek.BOARD_ROWS || HOTEL_BOARD_ROWS.length) - row}`;
}

function getBoardViewport(board, boardRows, boardCols) {
  const activeSquares = [];

  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      if (board[row][col] !== "#") {
        activeSquares.push({ row, col });
      }
    }
  }

  if (activeSquares.length === 0) {
    return FULL_BOARD_VIEWPORT;
  }

  const xs = activeSquares.map((square) => HOTEL_BOARD_COLUMNS[square.col]);
  const ys = activeSquares.map((square) => HOTEL_BOARD_ROWS[square.row]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paddingX = 8;
  const paddingY = 8;
  let left = Math.max(0, minX - paddingX);
  let right = Math.min(100, maxX + paddingX);
  let top = Math.max(0, minY - paddingY);
  let bottom = Math.min(100, maxY + paddingY);
  const width = Math.min(100, Math.max(right - left, 34));
  const height = Math.min(100, Math.max(bottom - top, 24));

  ({ start: left, end: right } = centerSpan(left, right, width));
  ({ start: top, end: bottom } = centerSpan(top, bottom, height));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function centerSpan(start, end, size) {
  const center = (start + end) / 2;
  let nextStart = center - size / 2;
  let nextEnd = center + size / 2;

  if (nextStart < 0) {
    nextEnd -= nextStart;
    nextStart = 0;
  }

  if (nextEnd > 100) {
    nextStart -= nextEnd - 100;
    nextEnd = 100;
  }

  return {
    start: Math.max(0, nextStart),
    end: Math.min(100, nextEnd),
  };
}

function applyBoardViewport(boardElement, viewport) {
  const scaleX = 100 / viewport.width;
  const scaleY = 100 / viewport.height;
  const maxOffsetX = 100 - viewport.width;
  const maxOffsetY = 100 - viewport.height;
  const positionX = maxOffsetX === 0 ? 50 : (viewport.left / maxOffsetX) * 100;
  const positionY = maxOffsetY === 0 ? 50 : (viewport.top / maxOffsetY) * 100;

  boardElement.style.setProperty("--board-aspect", `${viewport.width} / ${viewport.height}`);
  boardElement.style.setProperty("--board-fit-ratio", String(viewport.width / viewport.height));
  boardElement.style.setProperty("--hotel-bg-width", `${scaleX * 100}%`);
  boardElement.style.setProperty("--hotel-bg-height", `${scaleY * 100}%`);
  boardElement.style.setProperty("--hotel-bg-x", `${positionX}%`);
  boardElement.style.setProperty("--hotel-bg-y", `${positionY}%`);
}

function viewportCoordinate(coordinate, start, size) {
  return ((coordinate - start) / size) * 100;
}
