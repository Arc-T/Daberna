// src/match/services/match-card.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { PlayerMatchResult } from "../../../generated/prisma/client.js";
import { CARDS_PER_MATCH } from "../../card/contracts/constant.js";

export interface AssignedCard {
    playerMatchId: string;
    cardIds: string[];
}

@Injectable()
export class MatchCardService {
    private readonly logger = new Logger(MatchCardService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Pick N distinct cards, create MatchCard rows for the match,
     * and hand out `cardCount` cards per player.
     *
     * Runs inside the caller's transaction.
     */
    async createPoolAndAssign(
        tx: any,
        matchId: string,
        players: { id: string | null; name: string; cardCount: number; paidAmount: number }[]
    ): Promise<void> {
        // 1. Pick N distinct cards
        const picked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Card"
            WHERE "isActive" = true
            ORDER BY random()
            LIMIT ${CARDS_PER_MATCH}
        `;

        if (picked.length < CARDS_PER_MATCH) {
            throw new WsException(`کارت کافی در استخر موجود نیست (نیاز: ${CARDS_PER_MATCH}).`);
        }

        // 2. Insert MatchCard rows
        await tx.matchCard.createMany({
            data: picked.map((c) => ({ matchId, cardId: c.id }))
        });

        // 3. Shuffle and distribute
        const shuffled = picked.map((c) => c.id).sort(() => Math.random() - 0.5);
        let cursor = 0;

        for (const player of players) {
            const assigned = shuffled.slice(cursor, cursor + player.cardCount);
            cursor += player.cardCount;

            if (assigned.length < player.cardCount) {
                throw new WsException("کارت کافی برای توزیع موجود نیست.");
            }

            const pm = await tx.playerMatch.create({
                data: {
                    matchId,
                    userId: player.id || null,
                    cardCount: player.cardCount,
                    entryAmount: player.paidAmount ?? 0,
                    isBot: !player.id,
                    botUsername: player.id ? null : player.name,
                    botStats: player.id ? undefined : {},
                    result: PlayerMatchResult.PENDING
                }
            });

            await tx.matchCard.updateMany({
                where: { matchId, cardId: { in: assigned } },
                data: { assignedTo: pm.id, assignedAt: new Date() }
            });
        }
    }
}
