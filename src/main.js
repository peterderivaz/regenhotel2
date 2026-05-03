const boardElement = document.querySelector("#board");
const playAreaElement = document.querySelector(".play-area");
const statusElement = document.querySelector("#status");
const gameHeaderElement = document.querySelector(".game-header");
const gameTitle = document.querySelector("#game-title");
const controlsElement = document.querySelector("#game-controls");
const resetButton = document.querySelector("#reset-board");
const moveListElement = document.querySelector("#move-list");
const levelSelect = document.querySelector("#level-select");
const aiEnabledInput = document.querySelector("#ai-enabled");
const aiTypeSelect = document.querySelector("#ai-type");
const aiDepthSelect = document.querySelector("#ai-depth");
const ponderEnabledInput = document.querySelector("#ponder-enabled");
const ponderDepthSelect = document.querySelector("#ponder-depth");
const cacheEnabledInput = document.querySelector("#cache-enabled");
const moveListEnabledInput = document.querySelector("#move-list-enabled");
const blackDebugButton = document.querySelector("#black-debug-print");
const blackDebugOutput = document.querySelector("#black-debug-output");
const blackDebugOutputControl = document.querySelector(".debug-output-control");

const game = window.Makyek.createGame();
let aiTimer = null;
let ponderWorker = null;
let ponderRunId = 0;
let analysisMoves = [];
let analysisMoveScores = [];
let blackAnalysisMoveScores = [];
let blackAnalysisDepth = null;
let blackDebugSnapshot = null;
let hoveredMove = null;
let levelComplete = false;

fillDepthSelect(aiDepthSelect);
fillDepthSelect(ponderDepthSelect);
fillLevelSelect(levelSelect);

gameTitle.addEventListener("click", toggleAdvancedControls);
gameTitle.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  toggleAdvancedControls();
});

function draw() {
  boardElement.classList.remove("start-screen");
  window.Makyek.renderBoard({
    boardElement,
    statusElement,
    game,
    inputBlocked: isAiTurn() || levelComplete,
    analysisMoves,
    hoverMoves: hoveredMove ? [{ move: hoveredMove }] : [],
    onMoveStart: clearPonderPreview,
    onMove: async (from, to) => {
      clearPonderPreview();
      const result = game.movePiece(from, to);
      statusElement.textContent = result.message;
      if (result.ok) {
        await window.Makyek.animateAiMove(boardElement, { from, to }, result.capturedSquares);
      }

      if (result.ok && completeLevelIfNoGoblinsRemain()) {
        return;
      }

      draw();
      scheduleAiMove();
      if (shouldPonder()) {
        schedulePondering();
      }
    },
  });

}

resetButton.addEventListener("click", () => {
  clearAiTimer();
  clearPondering();
  clearBlackDebugSnapshot();
  levelComplete = false;
  game.reset();
  statusElement.textContent = game.helpText || "Board reset. Light to move.";
  draw();
  scheduleAiMove();
  schedulePondering();
});

levelSelect.addEventListener("change", async () => {
  await loadSelectedLevel();
});

aiEnabledInput.addEventListener("change", () => {
  clearPondering();
  draw();
  scheduleAiMove();
  schedulePondering();
});

aiTypeSelect.addEventListener("change", scheduleAiMove);
aiDepthSelect.addEventListener("change", scheduleAiMove);
cacheEnabledInput.addEventListener("change", () => {
  clearPondering();
  draw();
  scheduleAiMove();
  schedulePondering();
});
moveListEnabledInput.addEventListener("change", () => {
  renderMoveList(analysisMoveScores[0] ? analysisMoveScores[0].depth : null);
});
ponderEnabledInput.addEventListener("change", () => {
  clearPondering();
  draw();
  schedulePondering();
});
ponderDepthSelect.addEventListener("change", () => {
  clearPondering();
  draw();
  schedulePondering();
});
blackDebugButton.addEventListener("click", printBlackDebugSnapshot);

function isAiTurn() {
  return aiEnabledInput.checked && game.darkCanMove && game.currentPlayer === "dark" && !game.winner;
}

function scheduleAiMove() {
  clearAiTimer();

  if (!isAiTurn()) {
    return;
  }

  statusElement.textContent = "Black AI is thinking...";
  draw();

  aiTimer = window.setTimeout(async () => {
    const aiDepth = Number(aiDepthSelect.value);
    const aiResult = window.Makyek.chooseAiMoveResult(game, {
      type: aiTypeSelect.value,
      depth: aiDepth,
      cacheEnabled: cacheEnabledInput.checked,
    });
    const move = aiResult ? aiResult.move : null;

    if (!isMoveShape(move)) {
      rememberBlackDebugSnapshot(cloneBoard(game.board), cloneBoard(game.board), aiResult, aiDepth);
      statusElement.textContent = move
        ? "Black AI chose an invalid move. Use Black debug to copy the state."
        : "Black AI has no legal move.";
      draw();
      return;
    }

    rememberBlackAnalysis(aiResult, aiDepth);
    const boardBeforeMove = cloneBoard(game.board);
    const result = game.movePiece(move.from, move.to);
    rememberBlackDebugSnapshot(boardBeforeMove, cloneBoard(game.board), aiResult, aiDepth);
    statusElement.textContent = `Black AI: ${result.message}`;
    await window.Makyek.animateAiMove(boardElement, move, result.capturedSquares);

    if (result.ok && completeLevelIfNoGoblinsRemain()) {
      return;
    }

    draw();
    scheduleAiMove();
    schedulePondering();
  }, 250);
}

function clearAiTimer() {
  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function schedulePondering() {
  clearPonderWorker();

  if (!shouldPonder()) {
    analysisMoves = [];
    analysisMoveScores = [];
    draw();
    renderMoveList();
    return;
  }

  const runId = ponderRunId;
  const maxDepth = Number(ponderDepthSelect.value);

  statusElement.textContent = `Thinking for White to depth ${maxDepth}...`;

  if (!window.Worker) {
    statusElement.textContent = "White thinking needs Web Worker support.";
    return;
  }

  try {
    ponderWorker = new Worker("src/ponder-worker.js");
  } catch {
    statusElement.textContent = "White thinking needs this page served by a local web server.";
    return;
  }

  ponderWorker.addEventListener("message", (event) => {
    const { id, depth, result, positionsPerSecond, cacheHits } = event.data;

    if (id !== ponderRunId || !shouldPonder()) {
      return;
    }

    if (!result) {
      return;
    }

    const bestMoves = result.moves || (result.move ? [result.move] : []);

    if (bestMoves.length === 0) {
      return;
    }

    analysisMoves = bestMoves.map((move) => ({
      depth,
      move,
      score: result.score,
    }));
    analysisMoveScores = (result.scoredMoves || bestMoves.map((move) => ({
      move,
      score: result.score,
    }))).map((entry) => ({
      depth,
      move: entry.move,
      score: entry.score,
      isBest: bestMoves.some((move) => sameMove(move, entry.move)),
    }));
    statusElement.textContent = `White hint depth ${depth}: ${formatMove(result.move || bestMoves[0])} (${formatCount(bestMoves.length)} best). ${formatRate(positionsPerSecond)} positions/s, ${formatCount(cacheHits)} cache hits.`;
    draw();
    renderMoveList(depth);
  });
  ponderWorker.addEventListener("error", () => {
    if (runId !== ponderRunId) {
      return;
    }

    clearPondering();
    statusElement.textContent = "White thinking worker failed to start.";
    draw();
  });
  ponderWorker.postMessage({
    id: runId,
    board: game.board,
    maxDepth,
    cacheEnabled: cacheEnabledInput.checked,
  });
}

function shouldPonder() {
  return ponderEnabledInput.checked && game.currentPlayer === "light" && !game.winner;
}

function clearPondering() {
  analysisMoves = [];
  analysisMoveScores = [];
  blackAnalysisMoveScores = [];
  blackAnalysisDepth = null;
  hoveredMove = null;
  ponderRunId += 1;
  clearPonderWorker();
  renderMoveList();
}

function clearPonderPreview() {
  analysisMoves = [];
  hoveredMove = null;
  ponderRunId += 1;
  clearPonderWorker();
}

function clearPonderWorker() {
  if (ponderWorker) {
    ponderWorker.terminate();
    ponderWorker = null;
  }
}

function rememberBlackAnalysis(result, depth) {
  const bestMoves = result.moves || (result.move ? [result.move] : []);

  blackAnalysisDepth = depth;
  blackAnalysisMoveScores = (result.scoredMoves || bestMoves.map((move) => ({
    move,
    score: result.score,
  }))).map((entry) => ({
    depth,
    move: entry.move,
    score: entry.score,
    isBest: bestMoves.some((move) => isMoveShape(move) && isMoveShape(entry.move) && sameMove(move, entry.move)),
  }));
  renderMoveList(analysisMoveScores[0] ? analysisMoveScores[0].depth : null);
}

function isMoveShape(move) {
  return (
    move &&
    isSquareShape(move.from) &&
    isSquareShape(move.to)
  );
}

function isSquareShape(square) {
  return (
    square &&
    Number.isInteger(square.row) &&
    Number.isInteger(square.col)
  );
}

function rememberBlackDebugSnapshot(boardBefore, boardAfter, result, depth) {
  blackDebugSnapshot = {
    level: levelSelect.value,
    aiType: aiTypeSelect.value,
    depth,
    cacheEnabled: cacheEnabledInput.checked,
    boardBefore,
    boardAfter,
    result,
  };
}

function printBlackDebugSnapshot() {
  blackDebugOutputControl.hidden = false;
  blackDebugOutput.value = formatBlackDebugSnapshot();
  blackDebugOutput.focus();
  blackDebugOutput.select();
}

function clearBlackDebugSnapshot() {
  blackDebugSnapshot = null;
  blackDebugOutput.value = "";
  blackDebugOutputControl.hidden = true;
}

function formatBlackDebugSnapshot() {
  if (!blackDebugSnapshot) {
    return "No Black AI move has been recorded yet.";
  }

  const { level, aiType, depth, cacheEnabled, boardBefore, boardAfter, result } = blackDebugSnapshot;
  const bestMoves = result.moves || (result.move ? [result.move] : []);
  const scoredMoves = result.scoredMoves || [];
  const lines = [
    "BLACK AI DEBUG",
    `level=${level}`,
    `aiType=${aiType}`,
    `depth=${depth}`,
    `cacheEnabled=${cacheEnabled}`,
    `chosen=${result && isMoveShape(result.move) ? formatMove(result.move) : "none"}`,
    `chosenRaw=${JSON.stringify(result ? result.move : null)}`,
    `score=${result ? formatScore(result.score) : "none"}`,
    "",
    "boardBeforeBlack:",
    ...formatBoardForDebug(boardBefore),
    "",
    "boardAfterBlack:",
    ...formatBoardForDebug(boardAfter),
    "",
    "blackMoves:",
  ];

  scoredMoves.forEach((entry, index) => {
    const marker = bestMoves.some((move) => isMoveShape(move) && isMoveShape(entry.move) && sameMove(move, entry.move)) ? "*" : " ";
    const moveText = isMoveShape(entry.move) ? formatMove(entry.move) : JSON.stringify(entry.move);
    lines.push(`${String(index + 1).padStart(2, "0")}${marker} ${moveText} score=${formatScore(entry.score)}`);
  });

  if (scoredMoves.length === 0) {
    lines.push("(no scored moves)");
  }

  return lines.join("\n");
}

function formatBoardForDebug(board) {
  return board.map((row) => row.map((cell) => {
    if (cell === "#") {
      return "#";
    }

    if (cell === "light") {
      return "F";
    }

    if (cell === "dark") {
      return "g";
    }

    return ".";
  }).join(""));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function formatMove(move) {
  return `${window.Makyek.squareLabel(move.from)} to ${window.Makyek.squareLabel(move.to)}`;
}

function renderMoveList(depth) {
  moveListElement.classList.toggle("hidden", !moveListEnabledInput.checked);
  playAreaElement.classList.toggle("single-column", !moveListEnabledInput.checked);
  moveListElement.replaceChildren();

  if (!moveListEnabledInput.checked) {
    return;
  }

  moveListElement.append(createMoveScorePanel(
    depth ? `White depth ${depth}` : "White moves",
    analysisMoveScores,
  ));

  if (blackAnalysisMoveScores.length > 0) {
    moveListElement.append(createMoveScorePanel(
      blackAnalysisDepth ? `Black depth ${blackAnalysisDepth}` : "Black moves",
      blackAnalysisMoveScores,
    ));
  }
}

function createMoveScorePanel(headingText, moveScores) {
  const panel = document.createElement("section");
  const heading = document.createElement("h2");
  panel.className = "move-score-panel";
  heading.textContent = headingText;
  panel.append(heading);

  if (moveScores.length === 0) {
    const empty = document.createElement("p");
    empty.className = "move-list-empty";
    empty.textContent = "No scores yet.";
    panel.append(empty);
    return panel;
  }

  const list = document.createElement("ol");
  moveScores.forEach((entry) => {
    const item = document.createElement("li");
    const moveText = document.createElement("span");
    const scoreText = document.createElement("strong");

    item.className = entry.isBest ? "best" : "";
    moveText.textContent = formatMove(entry.move);
    scoreText.textContent = formatScore(entry.score);
    item.addEventListener("mouseenter", () => {
      hoveredMove = entry.move;
      draw();
    });
    item.addEventListener("mouseleave", () => {
      hoveredMove = null;
      draw();
    });
    item.addEventListener("focus", () => {
      hoveredMove = entry.move;
      draw();
    });
    item.addEventListener("blur", () => {
      hoveredMove = null;
      draw();
    });
    item.tabIndex = 0;
    item.append(moveText, scoreText);
    list.append(item);
  });
  panel.append(list);
  return panel;
}

function sameMove(firstMove, secondMove) {
  return (
    firstMove.from.row === secondMove.from.row &&
    firstMove.from.col === secondMove.from.col &&
    firstMove.to.row === secondMove.to.row &&
    firstMove.to.col === secondMove.to.col
  );
}

function formatScore(score) {
  if (score === Infinity) {
    return "win";
  }

  if (score === -Infinity) {
    return "loss";
  }

  return String(Math.round(score));
}

function formatRate(rate) {
  if (rate >= 1000000) {
    return `${(rate / 1000000).toFixed(1)}M`;
  }

  if (rate >= 1000) {
    return `${(rate / 1000).toFixed(1)}K`;
  }

  return String(Math.round(rate));
}

function formatCount(count) {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }

  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }

  return String(count || 0);
}

function fillDepthSelect(selectElement) {
  const selectedValue = selectElement.value || "2";

  selectElement.replaceChildren();

  for (let depth = 1; depth <= 10; depth += 1) {
    const option = document.createElement("option");
    option.value = String(depth);
    option.textContent = `${depth} ply`;
    option.selected = String(depth) === selectedValue;
    selectElement.append(option);
  }
}

function fillLevelSelect(selectElement) {
  selectElement.replaceChildren();

  window.Makyek.LEVEL_FILES.forEach((fileName, index) => {
    const option = document.createElement("option");
    option.value = fileName;
    option.textContent = `Level ${index + 1}`;
    selectElement.append(option);
  });
}

function completeLevelIfNoGoblinsRemain() {
  if (window.Makyek.countPieces(game.board, "dark") > 0) {
    return false;
  }

  levelComplete = true;
  clearAiTimer();
  clearPondering();
  statusElement.textContent = "Brilliant work.";
  showNextLevelScreen();
  return true;
}

async function showStartScreen() {
  clearAiTimer();
  clearPondering();
  const level = await loadLevelByIndex(0);
  const text = level.helpText || "";

  levelComplete = false;
  playAreaElement.classList.add("single-column");
  playAreaElement.classList.add("start-mode");
  gameHeaderElement.hidden = true;
  controlsElement.hidden = true;
  moveListElement.classList.add("hidden");
  boardElement.classList.add("start-screen");
  boardElement.style.setProperty("--board-aspect", "9 / 16");
  boardElement.style.setProperty("--board-fit-ratio", "0.5625");
  boardElement.replaceChildren(createStartButton(0, text));
  statusElement.textContent = text;
}

function createStartButton(levelIndex, text) {
  const button = document.createElement("button");
  const image = document.createElement("img");
  const textWrap = document.createElement("span");
  const helpText = document.createElement("span");
  const label = document.createElement("span");

  button.className = "start-button";
  button.type = "button";
  button.setAttribute("aria-label", "Start game");
  image.src = "assets/images/Poster_regen.png";
  image.alt = "Regen Hotel";
  textWrap.className = "start-text";
  helpText.className = "start-help";
  label.className = "start-label";
  helpText.textContent = text;
  label.textContent = "Click to start";
  textWrap.append(helpText, label);
  button.append(image, textWrap);
  button.addEventListener("click", () => startLevel(levelIndex));

  return button;
}

async function startLevel(levelIndex) {
  const startRect = boardElement.getBoundingClientRect();
  const overlay = createPosterTransitionOverlay(startRect);

  gameHeaderElement.hidden = false;
  gameHeaderElement.classList.add("transition-hidden");
  controlsElement.hidden = false;
  levelSelect.selectedIndex = levelIndex;
  await loadSelectedLevel();
  await animateStartPosterToHeader(overlay);
  gameHeaderElement.classList.remove("transition-hidden");
}

async function showNextLevelScreen() {
  const nextLevelIndex = getNextLevelIndex();
  const overlay = createPosterTransitionOverlay(gameHeaderElement.getBoundingClientRect());

  overlay.classList.add("poster-transition-active");
  await showLevelIntroScreen(nextLevelIndex);
  await animateHeaderPosterToStart(overlay);
}

async function showLevelIntroScreen(levelIndex) {
  const level = await loadLevelByIndex(levelIndex);
  const prefix = levelIndex === 0 ? "Play again. " : `Level ${levelIndex + 1}. `;
  const text = `${prefix}${level.helpText || ""}`;

  levelComplete = false;
  playAreaElement.classList.add("single-column");
  playAreaElement.classList.add("start-mode");
  gameHeaderElement.hidden = true;
  controlsElement.hidden = true;
  moveListElement.classList.add("hidden");
  boardElement.classList.add("start-screen");
  boardElement.style.setProperty("--board-aspect", "9 / 16");
  boardElement.style.setProperty("--board-fit-ratio", "0.5625");
  boardElement.replaceChildren(createStartButton(levelIndex, text));
  statusElement.textContent = text;
}

function createPosterTransitionOverlay(startRect) {
  const overlay = document.createElement("div");
  const image = document.createElement("img");

  overlay.className = "poster-transition";
  image.src = "assets/images/Poster_regen.png";
  image.alt = "";
  overlay.append(image);
  document.body.append(overlay);
  setPosterTransitionRect(overlay, startRect);

  return overlay;
}

function animateStartPosterToHeader(overlay) {
  const endRect = gameHeaderElement.getBoundingClientRect();

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      overlay.classList.add("poster-transition-active");
      setPosterTransitionRect(overlay, endRect);
    });

    window.setTimeout(() => {
      overlay.remove();
      resolve();
    }, 720);
  });
}

function animateHeaderPosterToStart(overlay) {
  const endRect = boardElement.getBoundingClientRect();

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      overlay.classList.remove("poster-transition-active");
      setPosterTransitionRect(overlay, endRect);
    });

    window.setTimeout(() => {
      overlay.remove();
      resolve();
    }, 720);
  });
}

function setPosterTransitionRect(element, rect) {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function getNextLevelIndex() {
  const nextIndex = levelSelect.selectedIndex + 1;

  if (nextIndex < levelSelect.options.length) {
    return nextIndex;
  }

  return 0;
}

function loadLevelByIndex(levelIndex) {
  const option = levelSelect.options[levelIndex];
  return window.Makyek.loadLevel(option ? option.value : levelSelect.options[0].value);
}

function toggleAdvancedControls() {
  const isCollapsed = controlsElement.classList.toggle("advanced-collapsed");
  gameTitle.setAttribute("aria-expanded", String(!isCollapsed));
}

async function loadSelectedLevel() {
  clearAiTimer();
  clearPondering();
  clearBlackDebugSnapshot();
  levelComplete = false;
  playAreaElement.classList.remove("start-mode");
  gameHeaderElement.hidden = false;
  controlsElement.hidden = false;
  statusElement.textContent = "Loading level...";

  try {
    const level = await window.Makyek.loadLevel(levelSelect.value);
    game.reset(level);
    setSelectValue(aiDepthSelect, level.aiDepth || 2);
    statusElement.textContent = level.helpText || "Level loaded. Light to move.";
  } catch (error) {
    game.reset(null);
    setSelectValue(aiDepthSelect, 2);
    statusElement.textContent = error.message || "Could not load level.";
  }

  draw();
  scheduleAiMove();
  schedulePondering();
}

function setSelectValue(selectElement, value) {
  const stringValue = String(value);

  if (![...selectElement.options].some((option) => option.value === stringValue)) {
    const option = document.createElement("option");
    option.value = stringValue;
    option.textContent = `${stringValue} ply`;
    selectElement.append(option);
  }

  selectElement.value = stringValue;
}

showStartScreen();
