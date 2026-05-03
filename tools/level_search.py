#!/usr/bin/env python3
import random
from itertools import combinations

ROWS = 7
COLS = 8
DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def parse_grid(lines):
    return [[cell if cell != " " else "." for cell in row] for row in lines]


def step(board):
    changes = []

    for row in range(ROWS):
        for col in range(COLS):
            cell = board[row][col]

            if cell == "#":
                continue

            light = 0
            dark = 0

            for row_delta, col_delta in DIRS:
                next_row = row + row_delta
                next_col = col + col_delta

                if next_row < 0 or next_row >= ROWS or next_col < 0 or next_col >= COLS:
                    continue

                neighbor = board[next_row][next_col]

                if neighbor == "F":
                    light += 1
                elif neighbor == "g":
                    dark += 1

            if cell == ".":
                if light >= 2 and dark < 2:
                    changes.append((row, col, "F"))
                elif dark >= 2 and light < 2:
                    changes.append((row, col, "g"))
            elif cell == "g" and light >= 2:
                changes.append((row, col, "F"))

    for row, col, cell in changes:
        board[row][col] = cell

    return len(changes)


def resolves_to_win(board):
    board = [row[:] for row in board]
    waves = 0

    while step(board):
      waves += 1

      if waves > ROWS * COLS:
          break

    return all(cell in ("#", "F") for row in board for cell in row), waves


def analyze(lines, placements):
    board = parse_grid(lines)
    empty = [
        (row, col)
        for row in range(ROWS)
        for col in range(COLS)
        if board[row][col] == "."
    ]
    wins = []

    tries = 0

    for combo in combinations(empty, placements):
        tries += 1
        placed = [row[:] for row in board]

        for row, col in combo:
            placed[row][col] = "F"

        won, waves = resolves_to_win(placed)

        if won:
            wins.append((combo, waves))

    return {
        "empty": len(empty),
        "tries": tries,
        "wins": wins,
    }


def format_grid(board):
    return ["".join(row) for row in board]


def random_candidate(width, height, placements, rng):
    left = (COLS - width) // 2
    top = (ROWS - height) // 2
    board = [["#" for _ in range(COLS)] for _ in range(ROWS)]

    for row in range(top, top + height):
        for col in range(left, left + width):
            board[row][col] = "."

    open_cells = [
        (row, col)
        for row in range(top, top + height)
        for col in range(left, left + width)
    ]
    obstacle_count = rng.randint(0, max(1, width * height // 6))
    protected = set()

    for row, col in rng.sample(open_cells, obstacle_count):
        board[row][col] = "#"
        protected.add((row, col))

    open_cells = [(row, col) for row, col in open_cells if (row, col) not in protected]
    filip_count = rng.randint(2, 4)
    goblin_count = rng.randint(1, 4)

    if len(open_cells) <= filip_count + goblin_count + placements:
        return None

    for row, col in rng.sample(open_cells, filip_count):
        board[row][col] = "F"
        open_cells.remove((row, col))

    for row, col in rng.sample(open_cells, goblin_count):
        board[row][col] = "g"
        open_cells.remove((row, col))

    if sum(cell == "." for row in board for cell in row) < placements:
        return None

    return board


def search(seed=7, attempts=120):
    rng = random.Random(seed)
    found = []

    for _ in range(attempts):
        width = rng.choice([4, 5, 6])
        height = rng.choice([4, 5])
        placements = rng.choice([3, 4])
        board = random_candidate(width, height, placements, rng)

        if not board:
            continue

        lines = format_grid(board)
        empty_count = sum(cell == "." for row in lines for cell in row)

        if empty_count > 18:
            continue

        result = analyze(lines, placements)
        win_count = len(result["wins"])

        if win_count == 0 or win_count > 12:
            continue

        best_waves = max(waves for _, waves in result["wins"])

        if best_waves < 3:
            continue

        score = (win_count, -best_waves, result["tries"])
        found.append((score, placements, lines, result))

    found.sort(key=lambda entry: entry[0])
    return found


LEVELS = {
    "level9": (
        [
            "########",
            "##F...##",
            "##.g..##",
            "##..g.##",
            "##...F##",
            "########",
            "########",
        ],
        3,
    ),
    "level10": (
        [
            "########",
            "#F.....#",
            "#.###..#",
            "#..g...#",
            "#..###.#",
            "#.....F#",
            "########",
        ],
        4,
    ),
    "level11": (
        [
            "########",
            "#..g...#",
            "#.F.#..#",
            "#...g..#",
            "#..#.F.#",
            "#...g..#",
            "########",
        ],
        4,
    ),
    "level12": (
        [
            "#......#",
            "#.g##..#",
            "#..F...#",
            "#.####.#",
            "#...F..#",
            "#..##g.#",
            "#......#",
        ],
        5,
    ),
}


def main():
    for index, (score, placements, lines, result) in enumerate(search()[:20], 1):
        print(f"\nCandidate {index}: score={score} place={placements} wins={len(result['wins'])}/{result['tries']}")
        print("\n".join(lines))
        for combo, waves in result["wins"][:6]:
            cells = " ".join(f"{chr(65 + col)}{ROWS - row}" for row, col in combo)
            print(f"  {cells} waves={waves}")


if __name__ == "__main__":
    main()
