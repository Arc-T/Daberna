export const FIRST_WINDOW_MS = 180_000; // 0 → 180s
export const SECOND_WINDOW_MS = 180_000; // 180 → 360s

/** Bot entry window (docs page 27–28) */
export const BOT_FILL_START_SECOND = 20; // bots start joining at 20s
export const BOT_FILL_END_SECOND = 80; // bots stop joining at 80s
export const MAX_BOTS_PER_MATCH = 15;

/** Interval between bot joins (docs page 28) */
export const BOT_FILL_MIN_DELAY_MS = 5_000;
export const BOT_FILL_MAX_DELAY_MS = 15_000;

/** Safety cap for the loop */
export const MAX_BOT_FILL_ATTEMPTS = 30;
