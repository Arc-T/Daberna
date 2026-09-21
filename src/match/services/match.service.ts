// src/match/services/match.service.ts

import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { Server } from "socket.io";

import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { RoomRepository } from "../../room/repositories/room.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import { MatchCardService } from "./match-card.service.js";
import { WinnerDetectorService } from "./winner-detector.service.js";
import { NumberCallerService } from "./number-caller.service.js";
import { MatchPrizeService } from "./match-prize.service.js";

import type { LobbyState } from "../../lobby/contracts/requests/lobby-request.dto.js";
import { MatchStatus, PlayerMatchResult, NotificationType } from "../../../generated/prisma/client.js";

const PLATFORM_CUT_RATE = 0.1;
const LINE_POOL_RATE = 0.1;
const FULL_HOUSE_POOL_RATE = 0.8;

@Injectable()
export class MatchService {
    private readonly logger = new Logger(MatchService.name);

    private server: Server;

    constructor(
        private readonly prisma: PrismaService,
        private readonly cardService: MatchCardService,
        private readonly roomRepository: RoomRepository,
        private readonly prizeService: MatchPrizeService,
        private readonly matchRepository: MatchRepository,
        private readonly numberCaller: NumberCallerService,
        private readonly winnerDetector: WinnerDetectorService
    ) {}

    setServer(server: Server) {
        this.server = server;
    }

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
    // Number calling
    // ─────────────────────────────────────────────────────────────

    async beginNumberCalling(matchId: string): Promise<void> {
        if (this.numberCaller.isRunning(matchId)) return;

        await this.preparePredeterminedOrderIfNeeded(matchId);

        this.numberCaller.start(matchId, (id) => this.tickMatch(id));

        this.logger.log(`Number calling started for match ${matchId}`);
    }

    private async tickMatch(matchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) return this.numberCaller.stop(matchId);

        if (match.status === MatchStatus.COMPLETED || match.status === MatchStatus.CANCELLED) {
            return this.numberCaller.stop(matchId);
        }

        const called = (match.calledNumbers as number[]) ?? [];
        const next = this.numberCaller.pickNext(called, matchId);

        if (next === null) {
            await this.finishMatch(matchId);
            return this.numberCaller.stop(matchId);
        }

        const updatedCalled = [...called, next];

        // Persist
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                calledNumbers: updatedCalled,
                matchNumbers: {
                    create: { number: next, orderIndex: called.length }
                }
            }
        });

        // 👇 emit
        this.emitNumberCalled(matchId, next, updatedCalled);

        // Check winners
        await this.checkForWinners(matchId, next, match);

        // Re-read
        const updated = await this.matchRepository.findById(matchId);
        if (updated?.status === MatchStatus.COMPLETED || updated?.status === MatchStatus.CANCELLED) {
            this.numberCaller.stop(matchId);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Winner detection
    // ─────────────────────────────────────────────────────────────

    private async checkForWinners(matchId: string, calledNumber: number, match: any): Promise<void> {
        const calledSet = new Set<number>((match.calledNumbers as number[]) ?? []);
        calledSet.add(calledNumber);

        const isNewPlayerMatch = this.numberCaller.hasPredeterminedOrder(matchId);

        // In a new-player match, only the new player can win
        const pool = isNewPlayerMatch
            ? match.playerMatches.filter((pm: any) => pm.user?.isNewPlayer)
            : match.playerMatches;

        if (pool.length === 0) return;

        // Line
        if (!match.lineWinnerId) {
            const lineWinners = this.winnerDetector.findLineWinners(pool, calledSet);
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
            const fhWinners = this.winnerDetector.findFullHouseWinners(pool, calledSet);
            if (fhWinners.length > 0) {
                await this.declareFullHouseWinners(
                    matchId,
                    fhWinners.map((pm) => pm.id)
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Declare line winners
    // ─────────────────────────────────────────────────────────────

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

        this.logger.log(`Line winners in ${matchId}: ${winners.length} × ${perWinner}`);

        // 👇 emit
        this.emitLineWinner(
            matchId,
            winners.map((pm) => ({
                playerMatchId: pm.id,
                userId: pm.userId,
                username: pm.user?.username ?? pm.botUsername ?? "بات",
                isBot: pm.isBot,
                prize: perWinner
            })),
            linePool
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Declare full-house winners
    // ─────────────────────────────────────────────────────────────

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

            // Mark remaining as LOST
            await tx.playerMatch.updateMany({
                where: { matchId, result: PlayerMatchResult.PENDING },
                data: { result: PlayerMatchResult.LOST }
            });
        });

        this.numberCaller.clearPredeterminedOrder(matchId);
        this.numberCaller.stop(matchId);

        this.logger.log(`Full-house winners in ${matchId}: ${winners.length} × ${perWinner}`);

        // 👇 emit
        this.emitFullHouseWinner(
            matchId,
            winners.map((pm) => ({
                playerMatchId: pm.id,
                userId: pm.userId,
                username: pm.user?.username ?? pm.botUsername ?? "بات",
                isBot: pm.isBot,
                prize: perWinner
            })),
            fullHousePool
        );

        this.emitMatchEnded(matchId);
    }

    // ─────────────────────────────────────────────────────────────
    // Snapshot
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

                    // all players' cards (public per docs page 17)
                    cards: pm.matchCards.map((mc) => this.buildCardSnapshot(mc.card, called))
                };
            })
        };
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
        winners: {
            playerMatchId: string;
            userId: string | null;
            username: string;
            isBot: boolean;
            prize: number;
        }[],
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
        winners: {
            playerMatchId: string;
            userId: string | null;
            username: string;
            isBot: boolean;
            prize: number;
        }[],
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

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    async finishMatch(matchId: string): Promise<void> {
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.COMPLETED,
                endTime: new Date()
            }
        });

        this.numberCaller.stop(matchId);
        this.numberCaller.clearPredeterminedOrder(matchId);

        this.emitMatchEnded(matchId);

        this.logger.log(`Match ${matchId} finished.`);
    }

    // ─────────────────────────────────────────────────────────────
    // New-player predetermined order
    // ─────────────────────────────────────────────────────────────

    private async preparePredeterminedOrderIfNeeded(matchId: string): Promise<void> {
        const match = await this.matchRepository.findById(matchId);
        if (!match) return;

        const newPlayer = match.playerMatches.find((pm) => pm.user?.isNewPlayer === true);
        if (!newPlayer) return;

        const firstCard = newPlayer.matchCards?.[0]?.card;
        if (!firstCard) return;

        this.numberCaller.setPredeterminedOrder(matchId, firstCard.numbers as number[]);

        this.logger.log(`Predetermined order set for match ${matchId} (new player: ${newPlayer.user?.username})`);
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
}
