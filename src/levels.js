window.Makyek = window.Makyek || {};

window.Makyek.LEVEL_FILES = ["level1.txt", "level2.txt", "level3.txt","level4.txt","level5.txt","level6.txt","level7.txt","level8.txt"];

window.Makyek.loadLevel = async function loadLevel(fileName) {
  const response = await fetch(`assets/levels/${fileName}`);

  if (!response.ok) {
    throw new Error(`Could not load ${fileName}`);
  }

  return window.Makyek.parseLevel(await response.text(), fileName);
};

window.Makyek.parseLevel = function parseLevel(source, name = "level") {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const gridStart = lines.findIndex((line) => isGridLine(line));

  if (gridStart === -1) {
    throw new Error(`${name} has no grid.`);
  }

  const helpText = lines.slice(0, gridStart).join(" ");
  const gridLines = lines.slice(gridStart, gridStart + window.Makyek.BOARD_ROWS);
  const settingLines = lines.slice(gridStart + window.Makyek.BOARD_ROWS);

  if (gridLines.length !== window.Makyek.BOARD_ROWS) {
    throw new Error(`${name} must have ${window.Makyek.BOARD_ROWS} grid rows.`);
  }

  const board = gridLines.map((line, rowIndex) => {
    if (line.length !== window.Makyek.BOARD_COLS || !isGridLine(line)) {
      throw new Error(`${name} row ${rowIndex + 1} must be ${window.Makyek.BOARD_COLS} cells.`);
    }

    return Array.from(line, parseLevelCell);
  });

  return {
    name,
    helpText,
    board,
    aiDepth: parseLevelDepth(settingLines, name),
    darkCanMove: gridLines.some((line) => line.includes("G")),
  };
};

function isGridLine(line) {
  return /^[# FgG]+$/.test(line);
}

function parseLevelCell(cell) {
  if (cell === "#") {
    return "#";
  }

  if (cell === "F") {
    return "light";
  }

  if (cell === "g" || cell === "G") {
    return "dark";
  }

  return null;
}

function parseLevelDepth(lines, name) {
  const depthLine = lines.find((line) => line.trim().startsWith("depth="));

  if (!depthLine) {
    return 2;
  }

  const depth = Number(depthLine.split("=")[1]);

  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`${name} has invalid depth setting.`);
  }

  return depth;
}
