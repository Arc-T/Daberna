// src/match/services/winner-detector.service.ts

import { Injectable } from "@nestjs/common";

export interface PlayerMatchWithCards {
    id: string;
    userId: string | null;
    isBot: boolean;
    lineWinner: boolean;
    fullHouseWinner: boolean;
    matchCards: { card: { numbers: number[]; layout: { rows: number[]; cols: number[] } } }[];
}

@Injectable()
export class WinnerDetectorService {
    /**
     * Find players whose card completes a line on the called set.
     */
    findLineWinners(players: PlayerMatchWithCards[], calledSet: Set<number>): PlayerMatchWithCards[] {
        const winners: PlayerMatchWithCards[] = [];

        for (const pm of players) {
            if (pm.lineWinner) continue;

            if (this.hasCompletedLine(pm, calledSet)) {
                winners.push(pm);
            }
        }

        return winners;
    }

    /**
     * Find players whose card completes all 15 numbers.
     */
    findFullHouseWinners(players: PlayerMatchWithCards[], calledSet: Set<number>): PlayerMatchWithCards[] {
        const winners: PlayerMatchWithCards[] = [];

        for (const pm of players) {
            if (pm.fullHouseWinner) continue;

            if (this.hasCompletedFullHouse(pm, calledSet)) {
                winners.push(pm);
            }
        }

        return winners;
    }

    // ─────────────────────────────────────────────────────────────
    // Per-player checks
    // ─────────────────────────────────────────────────────────────

    private hasCompletedLine(pm: PlayerMatchWithCards, calledSet: Set<number>): boolean {
        for (const mc of pm.matchCards ?? []) {
            const rows = this.extractRows(mc.card);
            if (rows.some((row) => row.every((n) => calledSet.has(n)))) {
                return true;
            }
        }
        return false;
    }

    private hasCompletedFullHouse(pm: PlayerMatchWithCards, calledSet: Set<number>): boolean {
        for (const mc of pm.matchCards ?? []) {
            const numbers = mc.card.numbers;
            if (numbers.every((n) => calledSet.has(n))) {
                return true;
            }
        }
        return false;
    }

    private extractRows(card: { numbers: number[]; layout: { rows: number[]; cols: number[] } }): number[][] {
        const rows: number[][] = [[], [], []];
        const numbers = card.numbers;
        const rowIdx = card.layout.rows;

        for (let i = 0; i < numbers.length; i++) {
            rows[rowIdx[i]].push(numbers[i]);
        }

        return rows;
    }
}
