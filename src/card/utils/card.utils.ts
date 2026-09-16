import { CARD_COLS, CARD_ROWS, COLUMN_RANGES, NUMBERS_PER_ROW, TOTAL_NUMBERS_PER_CARD } from "../contracts/constant.js";

export interface GeneratedCard {
    /** Flat list of 15 numbers */
    numbers: number[];
    /** Row index (0..2) for each number in `numbers` */
    rows: number[];
    /** Column index (0..8) for each number in `numbers` */
    cols: number[];
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a single valid Bingo card.
 *
 * Layout rules (docs page 9):
 *  - 3 rows × 9 columns
 *  - 15 numbers total (5 per row)
 *  - Each column has 1–3 numbers
 *  - Numbers within each column are sorted ascending
 *  - Column c contains numbers from COLUMN_RANGES[c]
 */
export function generateCard(): GeneratedCard {
    const colCounts = pickColumnCounts();

    // Pick numbers per column from its range, sorted ascending
    const columnNumbers = COLUMN_RANGES.map(([min, max], i) =>
        pickRandom(range(min, max), colCounts[i]).sort((a, b) => a - b),
    );

    const { grid } = placeInGrid(columnNumbers);

    // Flatten grid → numbers[], rows[], cols[]
    const numbers: number[] = [];
    const rows: number[] = [];
    const cols: number[] = [];

    for (let r = 0; r < CARD_ROWS; r++) {
        for (let c = 0; c < CARD_COLS; c++) {
            const v = grid[r][c];
            if (v !== null) {
                numbers.push(v);
                rows.push(r);
                cols.push(c);
            }
        }
    }

    return { numbers, rows, cols };
}

// ─────────────────────────────────────────────────────────────
// Validation (docs page 9)
// ─────────────────────────────────────────────────────────────

export function isValid(card: GeneratedCard): boolean {
    // 15 unique numbers
    if (card.numbers.length !== TOTAL_NUMBERS_PER_CARD) return false;
    if (new Set(card.numbers).size !== TOTAL_NUMBERS_PER_CARD) return false;

    // All numbers in 1–90
    if (card.numbers.some((n) => n < 1 || n > 90)) return false;

    // Each row has exactly 5 numbers
    const rowCounts = [0, 0, 0];
    for (const r of card.rows) rowCounts[r]++;
    if (rowCounts.some((c) => c !== NUMBERS_PER_ROW)) return false;

    // Numbers match their column range
    for (let i = 0; i < card.numbers.length; i++) {
        const [min, max] = COLUMN_RANGES[card.cols[i]];
        if (card.numbers[i] < min || card.numbers[i] > max) return false;
    }

    return true;
}

// ─────────────────────────────────────────────────────────────
// Similarity checks (docs page 10)
// ─────────────────────────────────────────────────────────────

/** Number of shared numbers between two cards */
export function sharedCount(a: GeneratedCard, b: GeneratedCard): number {
    const setB = new Set(b.numbers);
    return a.numbers.filter((n) => setB.has(n)).length;
}

/**
 * Number of shared numbers that fall in the SAME row index in both cards.
 * Docs page 10: shared numbers must not concentrate in the same rows.
 */
export function sharedRowOverlap(
    a: GeneratedCard,
    b: GeneratedCard,
): number {
    const mapB = new Map<number, number>();
    for (let i = 0; i < b.numbers.length; i++) {
        mapB.set(b.numbers[i], b.rows[i]);
    }

    let overlap = 0;
    for (let i = 0; i < a.numbers.length; i++) {
        const rowB = mapB.get(a.numbers[i]);
        if (rowB !== undefined && rowB === a.rows[i]) overlap++;
    }
    return overlap;
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function range(min: number, max: number): number[] {
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
}

function pickRandom<T>(pool: T[], count: number): T[] {
    const copy = [...pool];
    const out: T[] = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }
    return out;
}

function shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
}

/**
 * Produce 9 numbers, each in [1, 3], summing to 15.
 * Ensures each column has 1–3 numbers.
 */
function pickColumnCounts(): number[] {
    const counts = new Array(CARD_COLS).fill(1);
    let remaining = TOTAL_NUMBERS_PER_CARD - CARD_COLS; // 15 - 9 = 6

    while (remaining > 0) {
        const i = Math.floor(Math.random() * CARD_COLS);
        if (counts[i] < 3) {
            counts[i]++;
            remaining--;
        }
    }

    return counts;
}

/**
 * Place each column's values into 3 rows so every row ends up with 5 numbers.
 */
function placeInGrid(columnNumbers: number[][]): {
    grid: (number | null)[][];
} {
    const grid: (number | null)[][] = Array.from({ length: CARD_ROWS }, () =>
        new Array(CARD_COLS).fill(null),
    );
    const rowCount = [0, 0, 0];

    for (let col = 0; col < CARD_COLS; col++) {
        const values = columnNumbers[col];

        // Pick rows that still have capacity
        const available = shuffle([0, 1, 2]).filter(
            (r) => rowCount[r] < NUMBERS_PER_ROW,
        );

        if (available.length < values.length) {
            throw new Error("Cannot place numbers — row capacity exceeded");
        }

        for (let i = 0; i < values.length; i++) {
            const row = available[i];
            grid[row][col] = values[i];
            rowCount[row]++;
        }
    }

    return { grid };
}