import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { RoomRepository } from "../../room/repositories/room.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import type { LobbyState } from "../../lobby/contracts/requests/lobby-request.js";
import { MatchStatus, PlayerMatchResult } from "../../../generated/prisma/client.js";

@Injectable()
export class MatchService {
    private readonly logger = new Logger(MatchService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly matchRepository: MatchRepository,
        private readonly roomRepository: RoomRepository,
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Create
    // ─────────────────────────────────────────────────────────────

    /**
     * Create a match from a fully-formed lobby.
     *
     * Per docs:
     *  - `totalCards` cards are picked randomly from the pool
     *  - Each player receives the cards they paid for
     *  - Cards are reusable across matches
     */
    async startMatch(lobby: LobbyState): Promise<string> {
        const room = await this.roomRepository.findById(lobby.roomId);
        if (!room) {
            throw new NotFoundException("روم پیدا نشد.");
        }

        if (lobby.totalCards <= 0) {
            throw new BadRequestException("ظرفیت کارت‌ها صفر است.");
        }

        const match = await this.prisma.$transaction(async (tx) => {
            // ── 1. Pick random cards
            const picked = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "Card"
                WHERE "isActive" = true
                ORDER BY random()
                LIMIT ${lobby.totalCards}
            `;

            if (picked.length < lobby.totalCards) {
                throw new WsException("کارت کافی در استخر موجود نیست.");
            }

            const cardIds = picked.map((c) => c.id);

            // ── 2. Create Match
            const match = await tx.match.create({
                data: {
                    roomId: lobby.roomId,
                    roomEntryFee: room.entryFee,
                    status: MatchStatus.STARTED,
                    totalCards: lobby.totalCards,
                    startTime: new Date(),
                    calledNumbers: [],
                },
            });

            // ── 3. Distribute cards via cursor
            let cursor = 0;

            for (const player of lobby.players) {
                const assigned = cardIds.slice(cursor, cursor + player.cardCount);
                cursor += player.cardCount;

                if (assigned.length < player.cardCount) {
                    throw new WsException("کارت کافی برای توزیع موجود نیست.");
                }

                const pm = await tx.playerMatch.create({
                    data: {
                        matchId: match.id,
                        userId: player.id || null,
                        cardCount: player.cardCount,
                        entryAmount: player.paidAmount ?? 0,
                        isBot: !player.id,
                        botUsername: player.id ? null : player.name,
                        botStats: player.id ? undefined : {},
                        result: PlayerMatchResult.PENDING,
                    },
                });

                await tx.playerMatchCard.createMany({
                    data: assigned.map((cardId) => ({
                        playerMatchId: pm.id,
                        cardId,
                    })),
                });
            }

            return match;
        });

        this.logger.log(
            `Match ${match.id} created — room=${lobby.roomId}, cards=${lobby.totalCards}, players=${lobby.players.length}`,
        );

        return match.id;
    }

    // ─────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────

    async findById(matchId: string) {
        return this.matchRepository.findById(matchId);
    }

    async findActiveByRoom(roomId: string) {
        return this.matchRepository.findActiveByRoom(roomId);
    }

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    async declareLineWinner(matchId: string, playerMatchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) throw new NotFoundException("مچ پیدا نشد.");
        if (match.lineWinnerId) return;

        const pm = match.playerMatches.find((p) => p.id === playerMatchId);
        if (!pm) throw new NotFoundException("بازیکن در این مچ پیدا نشد.");

        await this.prisma.$transaction(async (tx) => {
            await tx.match.update({
                where: { id: matchId },
                data: {
                    status: MatchStatus.LINE_COMPLETED,
                    lineWinnerId: pm.userId ?? undefined,
                },
            });

            await tx.playerMatch.update({
                where: { id: playerMatchId },
                data: {
                    lineWinner: true,
                    result: PlayerMatchResult.LINE_WINNER,
                },
            });
        });

        this.logger.log(`Line winner declared in match ${matchId}`);
    }

    async declareFullHouseWinner(matchId: string, playerMatchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) throw new NotFoundException("مچ پیدا نشد.");
        if (match.fullHouseWinnerId) return;

        const pm = match.playerMatches.find((p) => p.id === playerMatchId);
        if (!pm) throw new NotFoundException("بازیکن در این مچ پیدا نشد.");

        await this.prisma.$transaction(async (tx) => {
            await tx.match.update({
                where: { id: matchId },
                data: {
                    status: MatchStatus.COMPLETED,
                    fullHouseWinnerId: pm.userId ?? undefined,
                    endTime: new Date(),
                },
            });

            await tx.playerMatch.update({
                where: { id: playerMatchId },
                data: {
                    fullHouseWinner: true,
                    result: PlayerMatchResult.FULL_HOUSE_WINNER,
                },
            });
        });

        this.logger.log(`Full-house winner declared in match ${matchId}`);
    }

    async finishMatch(matchId: string): Promise<void> {
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.COMPLETED,
                endTime: new Date(),
            },
        });

        this.logger.log(`Match ${matchId} finished.`);
    }

    async cancelMatch(matchId: string, reason: string): Promise<void> {
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.CANCELLED,
                endTime: new Date(),
            },
        });

        this.logger.warn(`Match ${matchId} cancelled: ${reason}`);
    }
}