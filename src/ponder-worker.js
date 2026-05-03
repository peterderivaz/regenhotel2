self.window = self;

importScripts("rules.js", "game.js", "ai.js");

self.addEventListener("message", (event) => {
  const { id, board, maxDepth, cacheEnabled } = event.data;
  const game = { board };
  const startedAt = self.performance.now();
  const cache = cacheEnabled ? new Map() : null;
  let totalPositions = 0;
  let totalCacheHits = 0;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const stats = { positions: 0, cacheHits: 0 };
    const result = self.Makyek.chooseAiMoveAtDepth(game, depth, "light", stats, cache);
    const elapsedSeconds = Math.max((self.performance.now() - startedAt) / 1000, 0.001);

    totalPositions += stats.positions;
    totalCacheHits += stats.cacheHits;

    self.postMessage({
      id,
      depth,
      result,
      positions: totalPositions,
      cacheHits: totalCacheHits,
      positionsPerSecond: totalPositions / elapsedSeconds,
    });
  }
});
