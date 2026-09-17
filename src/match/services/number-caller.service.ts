import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
    ALL_NUMBERS,
    CALL_INTERVAL_MS,
    NEW_PLAYER_FILLER_MIN,
    NEW_PLAYER_FILLER_MAX
} from "../contracts/constants/match.constant.js";

export type TickCallback = (matchId: string) => Promise<void>;

@Injectable()
export class NumberCallerService implements OnModuleDestroy {
    private readonly logger = new Logger(NumberCallerService.name);

    /** matchId → interval handle */
    private tickers = new Map<string, NodeJS.Timeout>();

    /** matchId → predetermined number order (new-player matches) */
    private predeterminedOrders = new Map<string, number[]>();

    onModuleDestroy() {
        for (const ticker of this.tickers.values()) clearInterval(ticker);
        this.tickers.clear();
    }

    // ─────────────────────────────────────────────────────────────
    // Ticker lifecycle
    // ─────────────────────────────────────────────────────────────

    start(matchId: string, onTick: TickCallback): void {
        if (this.tickers.has(matchId)) return;

        const ticker = setInterval(() => {
            onTick(matchId).catch((err) => this.logger.error(`Tick failed for ${matchId}:`, err));
        }, CALL_INTERVAL_MS);

        this.tickers.set(matchId, ticker);
        this.logger.log(`Ticker started for match ${matchId}`);
    }

    stop(matchId: string): void {
        const ticker = this.tickers.get(matchId);
        if (ticker) {
            clearInterval(ticker);
            this.tickers.delete(matchId);
            this.logger.log(`Ticker stopped for match ${matchId}`);
        }
    }

    stopAll(): void {
        for (const ticker of this.tickers.values()) clearInterval(ticker);
        this.tickers.clear();
    }

    // ─────────────────────────────────────────────────────────────
    // Number picking
    // ─────────────────────────────────────────────────────────────

    /**
     * Pick the next number.
     * Uses predetermined order if set, otherwise random from remaining.
     */
    pickNext(calledNumbers: number[], matchId: string): number | null {
        const calledSet = new Set(calledNumbers);

        // Predetermined order first (new-player matches)
        const predetermined = this.predeterminedOrders.get(matchId);
        if (predetermined) {
            for (const n of predetermined) {
                if (!calledSet.has(n)) return n;
            }
        }

        // Random from remaining
        const remaining = ALL_NUMBERS.filter((n) => !calledSet.has(n));
        if (remaining.length === 0) return null;

        return remaining[Math.floor(Math.random() * remaining.length)];
    }

    // ─────────────────────────────────────────────────────────────
    // Predetermined order (new-player matches)
    //
    // Daberna-2, page 24–25:
    //   1. Take the 15 winning numbers
    //   2. Add 20–25 random fillers
    //   3. Shuffle the combined set
    // ─────────────────────────────────────────────────────────────

    setPredeterminedOrder(matchId: string, winningNumbers: number[]): void {
        const others = ALL_NUMBERS.filter((n) => !winningNumbers.includes(n));
        const fillerCount =
            NEW_PLAYER_FILLER_MIN + Math.floor(Math.random() * (NEW_PLAYER_FILLER_MAX - NEW_PLAYER_FILLER_MIN + 1));

        const pool = [...others];
        const fillers: number[] = [];
        for (let i = 0; i < fillerCount; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            fillers.push(pool.splice(idx, 1)[0]);
        }

        const combined = this.shuffle([...winningNumbers, ...fillers]);
        this.predeterminedOrders.set(matchId, combined);

        this.logger.log(
            `Predetermined order set for match ${matchId} (${winningNumbers.length} winning + ${fillerCount} fillers)`
        );
    }

    clearPredeterminedOrder(matchId: string): void {
        this.predeterminedOrders.delete(matchId);
    }

    private shuffle<T>(arr: T[]): T[] {
        return [...arr].sort(() => Math.random() - 0.5);
    }
}
