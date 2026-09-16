import { Injectable, Logger } from "@nestjs/common";
import {
    BOT_NAMES,
    BOT_MIN_CARDS,
    BOT_MAX_CARDS,
    BOT_MIN_GAMES,
    BOT_MAX_GAMES,
    BOT_LINE_WIN_RATE,
    BOT_FULL_HOUSE_WIN_RATE
} from "../contracts/constants/bot.constant.js";
import { BotRepository } from "../repositories/bot.repository.js";
import { BotDto } from "../contracts/response/bot.dto.js";

@Injectable()
export class BotService {
    private readonly logger = new Logger(BotService.name);

    /** Usernames currently in use by active bots (in-memory) */
    private activeUsernames = new Set<string>();

    constructor(private readonly botRepository: BotRepository) {}

    /**
     * Create a random bot with a unique username and realistic stats.
     */
    async createRandomBot(): Promise<BotDto> {
        const username = await this.generateUniqueUsername();
        this.activeUsernames.add(username);

        const cardCount = this.randomInt(BOT_MIN_CARDS, BOT_MAX_CARDS);
        const stats = this.generateStats();

        const bot: BotDto = { username, cardCount, stats };

        this.logger.debug(`Bot created: ${username} (${cardCount} cards, ${stats.games} games)`);

        return bot;
    }

    /**
     * Release a bot's username back to the pool (when the match ends).
     */
    releaseUsername(username: string): void {
        this.activeUsernames.delete(username);
    }

    /**
     * Release many usernames (e.g. when a match finishes).
     */
    releaseUsernames(usernames: string[]): void {
        usernames.forEach((u) => this.activeUsernames.delete(u));
    }

    // ─────────────────────────────────────────────────────────────
    // Username generation
    // ─────────────────────────────────────────────────────────────

    private async generateUniqueUsername(): Promise<string> {
        const maxAttempts = 50;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = this.buildUsername();
            if (await this.isAvailable(candidate)) {
                return candidate;
            }
        }

        throw new Error("Could not generate a unique bot username");
    }

    private buildUsername(): string {
        const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const pattern = Math.floor(Math.random() * 3);

        switch (pattern) {
            case 0:
                // Name + 2 digits (e.g. "Arman82")
                return `${name}${this.randomInt(10, 99)}`;

            case 1:
                // Name + 1 letter (e.g. "ArmanK")
                return `${name}${this.randomLetter()}`;

            default:
                // Name + _ + 2 digits (e.g. "Arman_82")
                return `${name}_${this.randomInt(10, 99)}`;
        }
    }

    private async isAvailable(username: string): Promise<boolean> {
        // 1. Not in use by another active bot (in-memory)
        if (this.activeUsernames.has(username)) return false;

        // 2. Not used by a real user (DB check)
        const existing = await this.botRepository.isUsernameTaken(username);
        return !existing;
    }

    // ─────────────────────────────────────────────────────────────
    // Stats generation (docs page 45)
    // ─────────────────────────────────────────────────────────────

    private generateStats(): BotDto["stats"] {
        const games = this.randomInt(BOT_MIN_GAMES, BOT_MAX_GAMES);

        // Line wins ~8% with some jitter
        const lineWins = Math.max(1, Math.round(games * BOT_LINE_WIN_RATE * this.jitter(0.5, 1.5)));

        // Full house ~5%, but never more than line wins
        const fullHouseWins = Math.min(
            lineWins,
            Math.max(1, Math.round(games * BOT_FULL_HOUSE_WIN_RATE * this.jitter(0.5, 1.5)))
        );

        return { games, lineWins, fullHouseWins };
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private randomLetter(): string {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        return letters[Math.floor(Math.random() * letters.length)];
    }

    private jitter(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}
