import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { RoomRepository } from "../../room/repositories/room.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import { MatchCardService } from "./match-card.service.js";
import { WinnerDetectorService } from "./winner-detector.service.js";
import { NumberCallerService } from "./number-caller.service.js";
import { MatchPrizeService } from "./match-prize.service.js";

import type { LobbyState } from "../../lobby/contracts/requests/lobby-request.dto.js";
import { MatchStatus, PlayerMatchResult, NotificationType } from "../../../generated/prisma/client.js";
import { MatchCardSnapshot, MatchSnapshotDto } from "../contracts/responses/match-snapshot.dto.js";
import { Server } from "socket.io";

const PLATFORM_CUT_RATE = 0.1;
const LINE_POOL_RATE = 0.1;
const FULL_HOUSE_POOL_RATE = 0.8;

@Injectable()
export class MatchService {
    private readonly logger = new Logger(MatchService.name);

    private server: Server;

    setServer(server: Server) {
        this.server = server;
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly matchRepository: MatchRepository,
        private readonly roomRepository: RoomRepository,
        private readonly cardService: MatchCardService,
        private readonly winnerDetector: WinnerDetectorService,
        private readonly numberCaller: NumberCallerService,
        private readonly prizeService: MatchPrizeService
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Create
    // ─────────────────────────────────────────────────────────────

    async startMatch(lobby: LobbyState): Promise<string> {
        const room = await this.roomRepository.findById(lobby.roomId);
        if (!room) throw new NotFoundException("روم پیدا نشد.");
        if (lobby.totalCards <= 0) {
            throw new BadRequestException("ظرفیت کارت‌ها صفر است.");
        }

        const totalEntry = Number(room.entryFee) * lobby.totalCards;

        const matchId = await this.prisma.$transaction(async (tx) => {
            const match = await tx.match.create({
                data: {
                    roomId: lobby.roomId,
                    roomEntryFee: room.entryFee,
                    status: MatchStatus.STARTED,
                    totalCards: lobby.totalCards,
                    startTime: new Date(),
                    calledNumbers: [],
                    platformCut: totalEntry * PLATFORM_CUT_RATE,
                    linePool: totalEntry * LINE_POOL_RATE,
                    fullHousePool: totalEntry * FULL_HOUSE_POOL_RATE,
                    botWinnings: 0
                }
            });

            await this.cardService.createPoolAndAssign(tx, match.id, lobby.players);

            return match.id;
        });

        this.logger.log(
            `Match ${matchId} created — room=${lobby.roomId}, cards=${lobby.totalCards}, players=${lobby.players.length}`
        );

        return matchId;
    }

    // ─────────────────────────────────────────────────────────────
    // Number calling lifecycle
    // ─────────────────────────────────────────────────────────────

    async beginNumberCalling(matchId: string): Promise<void> {
        await this.preparePredeterminedOrderIfNeeded(matchId);
        this.numberCaller.start(matchId, (id) => this.tickMatch(id));
    }

    private async tickMatch(matchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) return this.numberCaller.stop(matchId);

        if (match.status === MatchStatus.COMPLETED || match.status === MatchStatus.CANCELLED) {
            return this.numberCaller.stop(matchId);
        }

        // 1. Pick next number
        const called = (match.calledNumbers as number[]) ?? [];
        const next = this.numberCaller.pickNext(called, matchId);

        if (next === null) {
            await this.finishMatch(matchId);
            return this.numberCaller.stop(matchId);
        }

        // 2. Persist
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                calledNumbers: [...called, next],
                matchNumbers: {
                    create: { number: next, orderIndex: called.length }
                }
            }
        });

        const updatedCalled = [...called, next];
        const visible = updatedCalled.slice(-5);

        this.emitNumberCalled(matchId, next, updatedCalled);

        // 3. Check winners
        await this.checkForWinners(matchId, next, match);

        // 4. Re-check match status
        const updated = await this.matchRepository.findById(matchId);
        if (updated?.status === MatchStatus.COMPLETED || updated?.status === MatchStatus.CANCELLED) {
            this.numberCaller.stop(matchId);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Winner detection & declaration
    // ─────────────────────────────────────────────────────────────

    private async checkForWinners(matchId: string, calledNumber: number, match: any): Promise<void> {
        const calledSet = new Set<number>((match.calledNumbers as number[]) ?? []);
        calledSet.add(calledNumber);

        // Line
        if (!match.lineWinnerId) {
            const lineWinners = this.winnerDetector.findLineWinners(match.playerMatches, calledSet);
            if (lineWinners.length > 0) {
                await this.declareLineWinners(
                    matchId,
                    lineWinners.map((pm) => pm.id)
                );
                return;
            }
        }

        // Full house
        if (!match.fullHouseWinnerId) {
            const fhWinners = this.winnerDetector.findFullHouseWinners(match.playerMatches, calledSet);
            if (fhWinners.length > 0) {
                await this.declareFullHouseWinners(
                    matchId,
                    fhWinners.map((pm) => pm.id)
                );
            }
        }
    }

    private async declareLineWinners(matchId: string, playerMatchIds: string[]): Promise<void> {
        if (playerMatchIds.length === 0) return;

        const match = await this.matchRepository.findById(matchId);
        if (!match || match.lineWinnerId) return;

        const winners = match.playerMatches.filter((p) => playerMatchIds.includes(p.id));
        if (winners.length === 0) return;

        const linePool = Number(match.linePool);
        const perWinner = linePool / winners.length;

        await this.prisma.$transaction(async (tx) => {
            const isFullHouseDone = match.fullHouseWinnerId !== null;
            const firstReal = winners.find((p) => p.userId);

            await tx.match.update({
                where: { id: matchId },
                data: {
                    status: isFullHouseDone ? MatchStatus.COMPLETED : MatchStatus.LINE_COMPLETED,
                    lineWinnerId: firstReal?.userId ?? undefined,
                    linePrize: linePool
                }
            });

            for (const pm of winners) {
                await tx.playerMatch.update({
                    where: { id: pm.id },
                    data: {
                        lineWinner: true,
                        prizeAmount: { increment: perWinner },
                        result: pm.fullHouseWinner ? PlayerMatchResult.BOTH_WINNER : PlayerMatchResult.LINE_WINNER
                    }
                });

                await this.prizeService.settle(tx, {
                    matchId,
                    userId: pm.userId,
                    isBot: pm.isBot,
                    amount: perWinner,
                    description: "برد خطی",
                    notificationType: NotificationType.LINE_WIN
                });
            }
        });

        this.emitLineWinner(
            matchId,
            winners.map((pm) => ({
                playerMatchId: pm.id,
                userId: pm.userId,
                username: pm.user?.username ?? pm.botUsername ?? "BOT",
                isBot: pm.isBot,
                prize: perWinner
            })),
            linePool
        );

        this.logger.log(`Line winners in ${matchId}: ${winners.length} × ${perWinner}`);
    }

    private async declareFullHouseWinners(matchId: string, playerMatchIds: string[]): Promise<void> {
        if (playerMatchIds.length === 0) return;

        const match = await this.matchRepository.findById(matchId);
        if (!match || match.fullHouseWinnerId) return;

        const winners = match.playerMatches.filter((p) => playerMatchIds.includes(p.id));
        if (winners.length === 0) return;

        const fullHousePool = Number(match.fullHousePool);
        const perWinner = fullHousePool / winners.length;

        await this.prisma.$transaction(async (tx) => {
            const firstReal = winners.find((p) => p.userId);

            await tx.match.update({
                where: { id: matchId },
                data: {
                    status: MatchStatus.COMPLETED,
                    fullHouseWinnerId: firstReal?.userId ?? undefined,
                    fullHousePrize: fullHousePool,
                    endTime: new Date()
                }
            });

            for (const pm of winners) {
                await tx.playerMatch.update({
                    where: { id: pm.id },
                    data: {
                        fullHouseWinner: true,
                        prizeAmount: { increment: perWinner },
                        result: pm.lineWinner ? PlayerMatchResult.BOTH_WINNER : PlayerMatchResult.FULL_HOUSE_WINNER
                    }
                });

                await this.prizeService.settle(tx, {
                    matchId,
                    userId: pm.userId,
                    isBot: pm.isBot,
                    amount: perWinner,
                    description: "برد خانه کامل",
                    notificationType: NotificationType.FULL_HOUSE_WIN
                });
            }

            // Mark non-winners
            await tx.playerMatch.updateMany({
                where: { matchId, result: PlayerMatchResult.PENDING },
                data: { result: PlayerMatchResult.LOST }
            });
        });

        this.server.to(`match-${matchId}`).emit("full-house-winner", {
            matchId,
            winners: winners.map((pm) => ({
                playerMatchId: pm.id,
                userId: pm.userId,
                username: pm.user?.username ?? pm.botUsername ?? "بات",
                isBot: pm.isBot,
                prize: perWinner
            })),
            pool: fullHousePool
        });

        // Also emit the final "match-ended" event
        this.emitFullHouseWinner(
            matchId,
            winners.map((pm) => ({
                playerMatchId: pm.id,
                userId: pm.userId,
                username: pm.user?.username ?? pm.botUsername ?? "BOT",
                isBot: pm.isBot,
                prize: perWinner
            })),
            fullHousePool
        );

        this.logger.log(`Full-house winners in ${matchId}: ${winners.length} × ${perWinner}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────

    async getSnapshot(matchId: string, requestingUserId?: string) {
        const match = await this.matchRepository.findById(matchId);
        if (!match) throw new NotFoundException("مچ پیدا نشد.");

        const called = (match.calledNumbers as number[]) ?? [];
        const visible = called.slice(-5);

        return {
            matchId: match.id,
            roomId: match.roomId,
            status: match.status,
            totalCards: match.totalCards,
            calledNumbers: visible,
            calledCount: called.length,
            startTime: match.startTime,
            players: match.playerMatches.map((pm) => {
                const isSelf = requestingUserId && pm.userId === requestingUserId;
                const cards = isSelf ? pm.matchCards.map((mc) => this.buildCardSnapshot(mc.card, called)) : undefined;

                return {
                    playerMatchId: pm.id,
                    userId: pm.userId,
                    username: pm.user?.username ?? pm.botUsername ?? "بات",
                    isBot: pm.isBot,
                    cardCount: pm.cardCount,
                    lineWinner: pm.lineWinner,
                    fullHouseWinner: pm.fullHouseWinner,
                    result: pm.result,
                    prizeAmount: Number(pm.prizeAmount ?? 0),
                    cards
                };
            })
        };
    }

    async findById(matchId: string) {
        return this.matchRepository.findById(matchId);
    }

    async findActiveByRoom(roomId: string) {
        return this.matchRepository.findActiveByRoom(roomId);
    }

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    async finishMatch(matchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) throw new NotFoundException("مچ پیدا نشد.");

        await this.prisma.match.update({
            where: { id: matchId },
            data: { status: MatchStatus.COMPLETED, endTime: new Date() }
        });

        this.numberCaller.stop(matchId);
        this.numberCaller.clearPredeterminedOrder(matchId);

        this.logger.log(`Match ${matchId} finished.`);
    }

    async cancelMatch(matchId: string, reason: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) throw new NotFoundException("مچ پیدا نشد.");

        this.numberCaller.stop(matchId);
        this.numberCaller.clearPredeterminedOrder(matchId);

        await this.prisma.$transaction(async (tx) => {
            await tx.match.update({
                where: { id: matchId },
                data: { status: MatchStatus.CANCELLED, endTime: new Date() }
            });

            for (const pm of match.playerMatches) {
                if (pm.isBot || !pm.userId) continue;

                await this.prizeService.refund(tx, pm.userId, Number(pm.entryAmount), matchId);
            }
        });

        this.logger.warn(`Match ${matchId} cancelled: ${reason}`);
    }

    // ─────────────────────────────────────────────────────────────
    // New-player predetermined order
    // ─────────────────────────────────────────────────────────────

    private async preparePredeterminedOrderIfNeeded(matchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) return;

        const newPlayer = match.playerMatches.find((pm) => pm.user?.isNewPlayer);
        if (!newPlayer) return;

        const firstCard = newPlayer.matchCards?.[0]?.card;
        if (!firstCard) return;

        this.numberCaller.setPredeterminedOrder(matchId, firstCard.numbers as number[]);
    }

    private buildCardSnapshot(card: { id: string; numbers: any; layout: any }, called: number[]) {
        const numbers = card.numbers as number[];
        const calledSet = new Set(called);
        const marked = numbers.filter((n) => calledSet.has(n));

        return {
            cardId: card.id,
            numbers,
            layout: card.layout,
            markedNumbers: marked
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Emit helpers
    // ─────────────────────────────────────────────────────────────

    private emitNumberCalled(matchId: string, number: number, allCalled: number[]): void {
        const visible = allCalled.slice(-5);

        this.server?.to(`match-${matchId}`).emit("number-called", {
            matchId,
            number,
            calledNumbers: visible,
            calledCount: allCalled.length
        });
    }

    private emitLineWinner(
        matchId: string,
        winners: { playerMatchId: string; userId: string | null; username: string; isBot: boolean; prize: number }[],
        pool: number
    ): void {
        this.server?.to(`match-${matchId}`).emit("line-winner", {
            matchId,
            winners,
            pool
        });
    }

    private emitFullHouseWinner(
        matchId: string,
        winners: { playerMatchId: string; userId: string | null; username: string; isBot: boolean; prize: number }[],
        pool: number
    ): void {
        this.server?.to(`match-${matchId}`).emit("full-house-winner", {
            matchId,
            winners,
            pool
        });
    }

    private emitMatchEnded(matchId: string): void {
        this.server?.to(`match-${matchId}`).emit("match-ended", {
            matchId,
            endedAt: new Date()
        });
    }
}
