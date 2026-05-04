window.Makyek = window.Makyek || {};

const HOTEL_BOARD_COLUMNS = [7.6, 18.5, 29.8, 41.0, 58.8, 70.4, 81.9, 93.0];
const HOTEL_BOARD_ROWS = [9.4, 23.3, 37.5, 51.6, 65.6, 79.2, 91.4];
const FULL_BOARD_VIEWPORT = { left: 0, top: 0, width: 100, height: 100 };
const FILIP_PLACEMENT_DURATION_MS = 480;
const FILIP_PLACEMENT_FAST_DURATION_MS = 90;
let currentViewport = FULL_BOARD_VIEWPORT;
let draggedSquare = null;
let selectedSquare = null;
let activeFilipPlacementAnimation = null;

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
  onSquareClick,
  onMove,
  onMoveStart,
  onReserveDragStart,
  inputBlocked,
  analysisMoves = [],
  hoverMoves = [],
  regenChanges = [],
  hiddenPlacedSquare = null,
  failurePrompt = "",
  onFailureClick,
}) {
  selectedSquare = null;
  boardElement.replaceChildren();

  const boardRows = Math.min(game.board.length, HOTEL_BOARD_ROWS.length);
  const boardCols = Math.min(game.board[0].length, HOTEL_BOARD_COLUMNS.length);
  currentViewport = getBoardViewport(game.board, boardRows, boardCols);
  applyBoardViewport(boardElement, currentViewport);
  updateBoardTorchSize(boardElement, currentViewport);
  ensureBoardTorchHandlers(boardElement);

  const percolationPreview = game.getFilipPercolationPreview
    ? game.getFilipPercolationPreview()
    : [];

  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      const square = createSquare(row, col, currentViewport);
      const piece = game.board[row][col];

      if (piece === "#") {
        const blockedSquare = createBlockedSquareLayer(row, col, currentViewport);

        if (blockedSquare) {
          boardElement.append(blockedSquare);
        }

        continue;
      }

      const squarePosition = { row, col };
      const canPlace = !inputBlocked && game.canPlaceAt && game.canPlaceAt(squarePosition);
      const isPlaced = game.isPlacedFilip && game.isPlacedFilip(squarePosition);
      const isRegenNew = regenChanges.some((change) => sameSquare(change.square, squarePosition));
      const isHiddenPlaced = hiddenPlacedSquare && sameSquare(hiddenPlacedSquare, squarePosition);
      const isPercolationPreview = percolationPreview.some((previewSquare) => (
        sameSquare(previewSquare, squarePosition)
      ));

      square.classList.toggle("place-target", canPlace);
      square.classList.toggle("placed-square", Boolean(isPlaced));
      square.classList.toggle("percolation-preview-square", isPercolationPreview);
      addSquareHandlers(square, onMove, inputBlocked, game, onSquareClick);

      if (piece) {
        square.append(createPiece(
          piece,
          row,
          col,
          statusElement,
          false,
          onMoveStart,
          game,
          onSquareClick,
          isPlaced,
          isRegenNew,
          isHiddenPlaced,
        ));
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

  if (failurePrompt) {
    boardElement.append(createFailurePrompt(failurePrompt, onFailureClick));
  }

  if (game.phase === "placing" && game.remainingPlacements > 0) {
    boardElement.append(createFilipReserve(game.remainingPlacements, inputBlocked, onReserveDragStart));
  }
};

function createFailurePrompt(text, onFailureClick) {
  const button = document.createElement("button");

  button.className = "level-failed-prompt";
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", () => {
    if (onFailureClick) {
      onFailureClick();
    }
  });

  return button;
}

window.Makyek.animateRegenStep = function animateRegenStep(boardElement, changes = []) {
  changes.forEach((change) => {
    const square = findSquare(boardElement, change.square);
    const piece = square ? square.querySelector(".piece") : null;
    const image = piece ? piece.querySelector(".piece-image") : null;

    if (!square || !piece || !image) {
      return;
    }

    square.classList.add("regen-square");
    piece.classList.add("regen-piece");
    image.src = getPieceImage(change.to, true);
  });

  return new Promise((resolve) => {
    window.setTimeout(() => {
      changes.forEach((change) => {
        const square = findSquare(boardElement, change.square);
        const piece = square ? square.querySelector(".piece") : null;
        const image = piece ? piece.querySelector(".piece-image") : null;

        if (image) {
          image.src = getPieceImage(change.to, false);
        }

        if (piece) {
          piece.classList.remove("regen-piece");
        }

        if (square) {
          square.classList.remove("regen-square");
        }
      });
      resolve();
    }, 1000);
  });
};

window.Makyek.getBoardPieceRect = function getBoardPieceRect(boardElement, square) {
  return findSquare(boardElement, square)?.querySelector(".piece")?.getBoundingClientRect() || null;
};

window.Makyek.getBoardSquareRect = function getBoardSquareRect(boardElement, square) {
  return findSquare(boardElement, square)?.getBoundingClientRect() || null;
};

window.Makyek.getReserveFilipRect = function getReserveFilipRect(boardElement, targetRect = null) {
  const reservePieces = [...boardElement.querySelectorAll(".reserve-filip")];

  if (reservePieces.length === 0) {
    return null;
  }

  const reservePiece = targetRect
    ? reservePieces.reduce((closestPiece, piece) => (
        rectDistanceSquared(piece.getBoundingClientRect(), targetRect) <
          rectDistanceSquared(closestPiece.getBoundingClientRect(), targetRect)
          ? piece
          : closestPiece
      ), reservePieces[0])
    : reservePieces[reservePieces.length - 1];

  return reservePiece ? reservePiece.getBoundingClientRect() : null;
};

window.Makyek.animateFilipPlacement = function animateFilipPlacement(boardElement, fromRect, toRect) {
  if (!fromRect || !toRect) {
    return Promise.resolve();
  }

  window.Makyek.finishFilipPlacementAnimation();

  const boardRect = boardElement.getBoundingClientRect();
  const clone = document.createElement("img");
  let timeoutId = null;
  let isSettled = false;
  let resolveAnimation = null;

  clone.className = "filip-placement-ghost";
  clone.src = getPieceImage("light", true);
  clone.alt = "";
  clone.style.left = `${fromRect.left - boardRect.left}px`;
  clone.style.top = `${fromRect.top - boardRect.top}px`;
  clone.style.width = `${fromRect.width}px`;
  clone.style.height = `${fromRect.height}px`;
  boardElement.append(clone);

  function settle() {
    if (isSettled) {
      return;
    }

    isSettled = true;
    window.clearTimeout(timeoutId);
    clone.remove();

    if (activeFilipPlacementAnimation?.clone === clone) {
      activeFilipPlacementAnimation = null;
    }

    if (resolveAnimation) {
      resolveAnimation();
    }
  }

  function moveToEnd(durationMs) {
    clone.style.transitionDuration = `${durationMs}ms`;
    clone.style.left = `${toRect.left - boardRect.left}px`;
    clone.style.top = `${toRect.top - boardRect.top}px`;
    clone.style.width = `${toRect.width}px`;
    clone.style.height = `${toRect.height}px`;
  }

  const promise = new Promise((resolve) => {
    resolveAnimation = resolve;
    timeoutId = window.setTimeout(settle, FILIP_PLACEMENT_DURATION_MS + 60);
  });

  activeFilipPlacementAnimation = {
    clone,
    finishFast() {
      if (isSettled) {
        return promise;
      }

      moveToEnd(FILIP_PLACEMENT_FAST_DURATION_MS);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(settle, FILIP_PLACEMENT_FAST_DURATION_MS + 20);
      return promise;
    },
  };

  window.requestAnimationFrame(() => {
    moveToEnd(FILIP_PLACEMENT_DURATION_MS);
  });

  return promise;
};

window.Makyek.finishFilipPlacementAnimation = function finishFilipPlacementAnimation() {
  if (!activeFilipPlacementAnimation) {
    return Promise.resolve();
  }

  return activeFilipPlacementAnimation.finishFast();
};

function createFilipReserve(remainingPlacements, inputBlocked, onReserveDragStart) {
  const reserve = document.createElement("div");

  reserve.className = "filip-reserve";
  reserve.setAttribute("aria-label", `${remainingPlacements} Filips left to place`);

  for (let index = 0; index < remainingPlacements; index += 1) {
    const image = document.createElement("img");

    image.className = "reserve-filip";
    image.src = getPieceImage("light", true);
    image.alt = "";
    image.draggable = !inputBlocked;
    image.addEventListener("dragstart", (event) => {
      if (inputBlocked) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/json", JSON.stringify({ source: "reserve" }));
      draggedSquare = { source: "reserve" };
      image.classList.add("dragging");
      if (onReserveDragStart) {
        onReserveDragStart();
      }
    });
    image.addEventListener("dragend", () => {
      image.classList.remove("dragging");
      draggedSquare = null;
      clearLegalTargetHighlights(image.closest(".board"));
      clearCapturePreview(image.closest(".board"));
      clearPercolationPreview(image.closest(".board"));
    });
    reserve.append(image);
  }

  return reserve;
}

function rectDistanceSquared(firstRect, secondRect) {
  const firstCenterX = firstRect.left + firstRect.width / 2;
  const firstCenterY = firstRect.top + firstRect.height / 2;
  const secondCenterX = secondRect.left + secondRect.width / 2;
  const secondCenterY = secondRect.top + secondRect.height / 2;
  const deltaX = firstCenterX - secondCenterX;
  const deltaY = firstCenterY - secondCenterY;

  return deltaX * deltaX + deltaY * deltaY;
}

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

function createBlockedSquareLayer(row, col, viewport) {
  const rect = squareViewportRect(row, col, viewport);

  if (!rect || rect.right < 0 || rect.left > 100 || rect.bottom < 0 || rect.top > 100) {
    return null;
  }

  const layer = document.createElement("div");
  const top = Math.max(0, rect.top);
  const right = Math.max(0, 100 - rect.right);
  const bottom = Math.max(0, 100 - rect.bottom);
  const left = Math.max(0, rect.left);

  layer.className = "blocked-square-layer";
  layer.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  layer.setAttribute("aria-hidden", "true");

  return layer;
}

function squareViewportRect(row, col, viewport) {
  const centerX = viewportCoordinate(HOTEL_BOARD_COLUMNS[col], viewport.left, viewport.width);
  const centerY = viewportCoordinate(HOTEL_BOARD_ROWS[row], viewport.top, viewport.height);
  const width = 9.2 * (100 / viewport.width);
  const height = 10.5 * (100 / viewport.height);

  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  };
}

function createPiece(
  piece,
  row,
  col,
  statusElement,
  canMove,
  onMoveStart,
  game,
  onSquareClick,
  isPlaced,
  isRegenNew,
  isHiddenPlaced,
) {
  const pieceElement = document.createElement("button");
  const pieceImage = document.createElement("img");
  const canDragPlacedFilip = game.phase === "placing" && piece === "light" && isPlaced;
  pieceElement.className = `piece ${piece}-piece${canMove ? " movable" : ""}${isPlaced ? " placed-piece" : ""}${isRegenNew ? " regen-piece" : ""}${isHiddenPlaced ? " hidden-placement-piece" : ""}`;
  pieceElement.type = "button";
  pieceElement.draggable = canMove || canDragPlacedFilip;
  pieceElement.disabled = !canMove && !(piece === "light" && isPlaced && onSquareClick);
  pieceElement.dataset.row = row;
  pieceElement.dataset.col = col;
  pieceElement.dataset.player = piece;
  pieceElement.setAttribute("aria-label", `${piece} piece on ${renderSquareLabel(row, col)}`);
  pieceElement.title = `${piece} piece`;
  pieceImage.className = "piece-image";
  pieceImage.src = getPieceImage(piece, piece === "light" && isPlaced);
  pieceImage.alt = "";
  pieceImage.draggable = false;
  pieceElement.append(pieceImage);

  pieceElement.addEventListener("dragstart", (event) => {
    if (!canMove && !canDragPlacedFilip) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({
      row,
      col,
      source: canDragPlacedFilip && !canMove ? "placed-filip" : "board",
    }));
    draggedSquare = {
      row,
      col,
      source: canDragPlacedFilip && !canMove ? "placed-filip" : "board",
    };
    pieceElement.classList.add("dragging");
    if (piece === "light" && canMove) {
      highlightLegalTargets(pieceElement.closest(".board"), game, { row, col });
    }
    if (onMoveStart) {
      onMoveStart();
    }
    if (window.Makyek.setStatusText) {
      window.Makyek.setStatusText(`Dragging ${piece} piece from ${renderSquareLabel(row, col)}.`);
    } else {
      statusElement.textContent = `Dragging ${piece} piece from ${renderSquareLabel(row, col)}.`;
    }
  });

  pieceElement.addEventListener("dragend", () => {
    pieceElement.classList.remove("dragging");
    draggedSquare = null;
    clearLegalTargetHighlights(pieceElement.closest(".board"));
    clearCapturePreview(pieceElement.closest(".board"));
    clearPercolationPreview(pieceElement.closest(".board"));
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
    if (onSquareClick && piece === "light" && isPlaced) {
      event.stopPropagation();
      onSquareClick({ row, col });
      return;
    }

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

function addSquareHandlers(square, onMove, inputBlocked, game, onSquareClick) {
  square.addEventListener("pointerenter", () => {
    if (inputBlocked || draggedSquare || game.phase !== "placing") {
      return;
    }

    clearPercolationPreview(square.parentElement);

    if (previewPercolation(square, game, { source: "click" }) > 0) {
      square.classList.add("placement-hover-target");
    }
  });

  square.addEventListener("pointerleave", () => {
    square.classList.remove("placement-hover-target");

    if (!draggedSquare) {
      clearPercolationPreview(square.parentElement);
    }
  });

  square.addEventListener("dragover", (event) => {
    if (inputBlocked) {
      return;
    }

    event.preventDefault();
    square.classList.remove("placement-hover-target");
    square.classList.add("drop-target");
    clearCapturePreview(square.parentElement);
    clearPercolationPreview(square.parentElement);
    previewPercolation(square, game, draggedSquare);
    previewCaptures(square, game, draggedSquare);
  });

  square.addEventListener("dragleave", () => {
    square.classList.remove("drop-target");
    clearCapturePreview(square.parentElement);
    clearPercolationPreview(square.parentElement);
  });

  square.addEventListener("drop", (event) => {
    if (inputBlocked) {
      return;
    }

    event.preventDefault();
    square.classList.remove("drop-target");
    clearLegalTargetHighlights(square.parentElement);
    clearCapturePreview(square.parentElement);
    clearPercolationPreview(square.parentElement);

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
    if (onSquareClick && !inputBlocked) {
      onSquareClick({
        row: Number(square.dataset.row),
        col: Number(square.dataset.col),
      });
      return;
    }

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

function previewPercolation(square, game, from) {
  if (!game.getFilipPercolationPreview || game.phase !== "placing") {
    return 0;
  }

  const to = {
    row: Number(square.dataset.row),
    col: Number(square.dataset.col),
  };
  const previewSquares = game.getFilipPercolationPreview({
    source: from?.source,
    from,
    to,
  });

  previewSquares.forEach((previewSquare) => {
    findSquare(square.parentElement, previewSquare)?.classList.add("percolation-drag-preview-square");
  });

  return previewSquares.length;
}

function clearPercolationPreview(boardElement) {
  if (!boardElement) {
    return;
  }

  boardElement.querySelectorAll(".percolation-drag-preview-square").forEach((square) => {
    square.classList.remove("percolation-drag-preview-square");
  });

  boardElement.querySelectorAll(".placement-hover-target").forEach((square) => {
    square.classList.remove("placement-hover-target");
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

function updateBoardTorchSize(boardElement, viewport) {
  const boardRect = boardElement.getBoundingClientRect();
  const roomWidth = boardRect.width * (9.2 / viewport.width);
  const roomHeight = boardRect.height * (10.5 / viewport.height);
  const roomSize = Math.max(1, (roomWidth + roomHeight) / 2);

  boardElement.style.setProperty("--torch-clear-radius", `${roomSize * 1.5}px`);
  boardElement.style.setProperty("--torch-fade-radius", `${roomSize * 2.5}px`);
}

function ensureBoardTorchHandlers(boardElement) {
  if (boardElement.dataset.torchHandlers === "true") {
    return;
  }

  boardElement.dataset.torchHandlers = "true";
  boardElement.addEventListener("pointermove", (event) => {
    const rect = boardElement.getBoundingClientRect();

    boardElement.classList.add("torch-active");
    boardElement.style.setProperty("--torch-x", `${event.clientX - rect.left}px`);
    boardElement.style.setProperty("--torch-y", `${event.clientY - rect.top}px`);
  });
  boardElement.addEventListener("pointerleave", () => {
    boardElement.classList.remove("torch-active");
  });
}

function viewportCoordinate(coordinate, start, size) {
  return ((coordinate - start) / size) * 100;
}
