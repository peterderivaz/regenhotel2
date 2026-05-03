window.Makyek = window.Makyek || {};

const BEST_MOVE_SCORE_WINDOW = 3;
const TERMINAL_DEPTH_SCORE_STEP = Math.max(10, BEST_MOVE_SCORE_WINDOW + 1);

window.Makyek.chooseAiMove = function chooseAiMove(game, options) {
  const result = window.Makyek.chooseAiMoveResult(game, options);
  return result ? result.move : null;
};

window.Makyek.chooseAiMoveResult = function chooseAiMoveResult(game, options) {
  const player = "dark";
  const board = game.board;
  const moves = window.Makyek.getAllLegalMoves(board, player);
  const cache = options.cacheEnabled ? new Map() : null;

  if (moves.length === 0) {
    return null;
  }

  if (options.type === "random") {
    const move = moves[Math.floor(Math.random() * moves.length)];
    return {
      move,
      moves: [move],
      scoredMoves: moves.map((entry) => ({ move: entry, score: 0 })),
      score: 0,
    };
  }

  if (options.type === "greedy") {
    return chooseGreedyResult(board, moves, player);
  }

  return chooseMinimaxResult(board, moves, player, options.depth, null, cache);
};

window.Makyek.chooseAiMoveAtDepth = function chooseAiMoveAtDepth(
  game,
  depth,
  player = "dark",
  stats,
  cache,
) {
  const board = game.board;
  const moves = window.Makyek.getAllLegalMoves(board, player);

  if (moves.length === 0) {
    return null;
  }

  return chooseMinimaxResult(board, moves, player, depth, stats, cache);
};

function chooseGreedyResult(board, moves, player) {
  return scoredResultByScore(moves, (move) => {
    const result = window.Makyek.applyMove(board, move, player);
    return result.captured * 1000 + evaluateBoard(result.board, player);
  });
}

function chooseMinimaxMove(board, moves, player, depth, cache) {
  const result = chooseMinimaxResult(board, moves, player, depth, null, cache);
  return result ? randomMove(result.moves) : null;
}

function chooseMinimaxResult(board, moves, player, depth, stats, cache) {
  const searchDepth = Math.max(1, Math.min(Number(depth) || 1, 10));
  const orderedMoves = orderMoves(board, moves, player);

  return scoredResultByScore(orderedMoves, (move) => {
    const result = window.Makyek.applyMove(board, move, player);

    if (result.winner) {
      countPosition(stats);
      return winnerScore(result.winner, player, searchDepth);
    }

    return minimax(
      result.board,
      window.Makyek.otherPlayer(player),
      player,
      searchDepth - 1,
      -Infinity,
      Infinity,
      stats,
      cache,
    );
  });
}

function minimax(board, playerToMove, maximizingPlayer, depth, alpha, beta, stats, cache) {
  const cacheKey = cache ? makeCacheKey(board, playerToMove, maximizingPlayer, depth) : null;

  if (cacheKey && cache.has(cacheKey)) {
    countCacheHit(stats);
    return cache.get(cacheKey);
  }

  countPosition(stats);

  const opponent = window.Makyek.otherPlayer(maximizingPlayer);

  if (window.Makyek.countPieces(board, opponent) === 0) {
    return rememberScore(cache, cacheKey, winnerScore(maximizingPlayer, maximizingPlayer, depth));
  }

  if (window.Makyek.countPieces(board, maximizingPlayer) === 0) {
    return rememberScore(cache, cacheKey, winnerScore(opponent, maximizingPlayer, depth));
  }

  if (depth === 0) {
    return rememberScore(cache, cacheKey, evaluateBoard(board, maximizingPlayer));
  }

  const moves = orderMoves(
    board,
    window.Makyek.getAllLegalMoves(board, playerToMove),
    playerToMove,
  );

  if (moves.length === 0) {
    return rememberScore(cache, cacheKey, evaluateBoard(board, maximizingPlayer));
  }

  const limitedMoves = moves.slice(0, 24);
  const isMaximizing = playerToMove === maximizingPlayer;
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let searchedAllMoves = true;

  limitedMoves.forEach((move) => {
    if (alpha >= beta) {
      searchedAllMoves = false;
      return;
    }

    const result = window.Makyek.applyMove(board, move, playerToMove);
    const score = result.winner
      ? winnerScore(result.winner, maximizingPlayer, depth)
      : minimax(
          result.board,
          window.Makyek.otherPlayer(playerToMove),
          maximizingPlayer,
          depth - 1,
          alpha,
          beta,
          stats,
          cache,
        );

    if (isMaximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, score);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, score);
    }
  });

  if (searchedAllMoves && limitedMoves.length === moves.length) {
    rememberScore(cache, cacheKey, bestScore);
  }

  return bestScore;
}

function countPosition(stats) {
  if (stats) {
    stats.positions += 1;
  }
}

function countCacheHit(stats) {
  if (stats) {
    stats.cacheHits += 1;
  }
}

function rememberScore(cache, cacheKey, score) {
  if (cacheKey) {
    cache.set(cacheKey, score);
  }

  return score;
}

function makeCacheKey(board, playerToMove, maximizingPlayer, depth) {
  return `${playerToMove[0]}${maximizingPlayer[0]}${depth}|${encodeBoard(board)}`;
}

function encodeBoard(board) {
  const cells = [];

  board.forEach((row) => {
    row.forEach((piece) => {
      cells.push(piece ? piece[0] : ".");
    });
  });

  return cells.join("");
}

function bestMoveByScore(moves, scoreMove) {
  const result = scoredResultByScore(moves, scoreMove);
  return result ? randomMove(result.moves) : null;
}

function scoredResultByScore(moves, scoreMove) {
  let bestScore = -Infinity;
  const scoredMoves = [];

  moves.forEach((move) => {
    const score = scoreMove(move);
    scoredMoves.push({ move, score });
    bestScore = Math.max(bestScore, score);
  });

  const sortedMoves = scoredMoves.sort((a, b) => b.score - a.score);
  const bestMoves = sortedMoves
    .filter((entry) => bestScore - entry.score <= BEST_MOVE_SCORE_WINDOW)
    .map((entry) => entry.move);

  return {
    move: randomMove(bestMoves),
    moves: bestMoves,
    scoredMoves: sortedMoves,
    score: bestScore,
  };
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function orderMoves(board, moves, player) {
  return moves
    .map((move) => {
      const result = window.Makyek.applyMove(board, move, player);

      return {
        move,
        score: result.captured * 1000 + evaluateBoard(result.board, player),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function evaluateBoard(board, player) {
  const opponent = window.Makyek.otherPlayer(player);
  const material = window.Makyek.countPieces(board, player) - window.Makyek.countPieces(board, opponent);
  const mobility =
    window.Makyek.getAllLegalMoves(board, player).length -
    window.Makyek.getAllLegalMoves(board, opponent).length;

  return material * 100 + mobility * 1;
}

function winnerScore(winner, maximizingPlayer, depth) {
  const score = 100000 + depth * TERMINAL_DEPTH_SCORE_STEP;
  return winner === maximizingPlayer ? score : -score;
}
