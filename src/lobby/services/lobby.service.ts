import { Injectable, Logger } from "@nestjs/common";
import { Server } from "socket.io";
import { WsException } from "@nestjs/websockets";
import { LobbyResponseDto, LobbyState } from "../contracts/requests/lobby-request.js";
import { RoomRepository } from "../../room/repositories/room.repository.js";
import { RoomStatusDto } from "../../room/contracts/response/room-status.dto.js";
import {
    MAX_ROOM_CARDS,
    MIN_ROOM_CARDS,
    MAX_CARDS_PER_MATCH,
    MIN_CARDS_TO_START
} from "../../room/contracts/constants/room.constant.js";
import {
    FIRST_WINDOW_MS as FIRST_LOBBY_WAITING_TIME_MS,
    SECOND_WINDOW_MS as SECOND_LOBBY_WAITING_TIME_MS,
    BOT_FILL_MIN_DELAY_MS,
    BOT_FILL_MAX_DELAY_MS,
    MAX_BOT_FILL_ATTEMPTS
} from "../contracts/constants/lobby.constant.js";
import { UserRepository } from "../../user/repositories/user.repository.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { MatchService } from "../../match/services/match.service.js";
import { BotService } from "../../bot/services/bot.service.js";

@Injectable()
export class LobbyService {
    private server: Server;
    private readonly logger = new Logger(LobbyService.name);

    /** roomId → lobby state */
    private lobby = new Map<string, LobbyState>();

    /** userId → roomId (disconnect logging only) */
    private userRoomMap = new Map<string, string>();

    /** roomId → pending timers */
    private lobbyTimers = new Map<string, NodeJS.Timeout[]>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly matchService: MatchService,
        private readonly roomRepository: RoomRepository,
        private readonly userRepository: UserRepository,
        private readonly botService: BotService
    ) {
        this.initializeLobbyRooms();
    }

    setServer(server: Server) {
        this.server = server;
    }

    getLobbyStatus(roomId: string): LobbyResponseDto {
        const lobby = this.lobby.get(roomId);
        if (!lobby) throw new WsException("لابی پیدا نشد.");

        return {
            roomId,
            totalCards: lobby.totalCards,
            playerCount: lobby.players.length,
            waitingTime: this.getRemainingSeconds(lobby.createdAt),
            minCards: MIN_ROOM_CARDS,
            maxCards: MAX_ROOM_CARDS,
            status: lobby.status,
            players: lobby.players.map((p) => ({
                name: p.name,
                cardCount: p.cardCount
            }))
        };
    }

    async getAllRoomsWithStatus(): Promise<RoomStatusDto[]> {
        const rooms = await this.roomRepository.findAll();

        return rooms.map((room) => {
            const lobbyStatus = this.getLobbyStatus(room.id);

            return {
                id: room.id,
                name: room.name,
                entryFee: Number(room.entryFee),
                minCards: MIN_ROOM_CARDS,
                maxCards: MAX_ROOM_CARDS,
                filledCards: lobbyStatus.totalCards,
                remainingTime: lobbyStatus.waitingTime,
                status: lobbyStatus.status
            };
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Enter
    // ─────────────────────────────────────────────────────────────

    async enterLobby(userId: string, name: string, roomId: string, cardCount: number): Promise<LobbyState> {
        // ── Validate room
        const room = await this.roomRepository.findById(roomId);
        if (!room) throw new WsException("روم نامعتبر است.");

        // ── Validate lobby
        const lobby = this.lobby.get(roomId);
        if (!lobby) throw new WsException("لابی پیدا نشد.");
        if (lobby.status !== "WAITING") {
            throw new WsException("این لابی دیگر قابل ورود نیست.");
        }

        // ── Prevent double-join (same room)
        if (lobby.players.some((p) => p.id === userId)) {
            throw new WsException("کاربر در حال حاضر در این روم است.");
        }

        // ── Validate card count
        if (cardCount < MIN_ROOM_CARDS || cardCount > MAX_ROOM_CARDS) {
            throw new WsException(`تعداد کارت باید بین ${MIN_ROOM_CARDS} تا ${MAX_ROOM_CARDS} باشد.`);
        }

        // ── Validate capacity
        if (lobby.totalCards + cardCount > MAX_CARDS_PER_MATCH) {
            throw new WsException("ظرفیت کارت‌های این مچ تکمیل شده است.");
        }

        // ── Validate user + balance
        const user = await this.userRepository.findById(userId)!;
        if (!user) throw new WsException("کاربر یافت نشد.");

        const cost = cardCount * Number(room.entryFee);
        if (Number(user.credit) < cost) {
            throw new WsException("موجودی کافی نیست.");
        }

        // ── Atomic: deduct + transaction
        await this.prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { credit: { decrement: cost } }
            });

            await tx.transaction.create({
                data: {
                    userId,
                    type: "GAME_ENTRY",
                    amount: -cost,
                    balanceBefore: Number(user.credit),
                    balanceAfter: Number(updatedUser.credit),
                    status: "COMPLETED",
                    referenceId: roomId,
                    description: `ورود به ${room.name} - ${cardCount} کارت`
                }
            });
        });

        // ── Add player
        const isLobbyEmpty = lobby.players.length === 0;

        lobby.players.push({
            id: userId,
            name,
            cardCount,
            paidAmount: cost,
            joinedAt: new Date().toISOString()
        });
        lobby.totalCards += cardCount;

        this.lobby.set(roomId, lobby);
        this.userRoomMap.set(userId, roomId);

        this.logger.debug(`User ${userId} entered lobby ${roomId} with ${cardCount} cards (cost: ${cost})`);

        // ── First player → schedule windows
        if (isLobbyEmpty) {
            this.scheduleWaiting(roomId);
        }

        // ── Instant full → cancel + finalize
        if (lobby.totalCards >= MAX_CARDS_PER_MATCH) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
        }

        return lobby;
    }

    // ─────────────────────────────────────────────────────────────
    // Windows
    // ─────────────────────────────────────────────────────────────

    private scheduleWaiting(roomId: string): void {
        if (this.lobbyTimers.has(roomId)) return;

        const t1 = setTimeout(() => {
            this.handleFirstPeriodTime(roomId).catch((err) =>
                this.logger.error(`first time period failed for ${roomId}`, err)
            );
        }, FIRST_LOBBY_WAITING_TIME_MS);

        const t2 = setTimeout(() => {
            this.handleSecondPeriodTime(roomId).catch((err) =>
                this.logger.error(`second time period  failed for ${roomId}`, err)
            );
        }, FIRST_LOBBY_WAITING_TIME_MS + SECOND_LOBBY_WAITING_TIME_MS);

        this.lobbyTimers.set(roomId, [t1, t2]);

        this.logger.debug(`Scheduled windows for room ${roomId}`);
    }

    private cancelWaiting(roomId: string): void {
        const timers = this.lobbyTimers.get(roomId);
        if (!timers) return;

        timers.forEach(clearTimeout);
        this.lobbyTimers.delete(roomId);

        this.logger.debug(`Cancelled windows for room ${roomId}`);
    }

    private async handleFirstPeriodTime(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        lobby.firstPeriodTimeFired = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`1rst period time fired for room ${roomId}`);

        if (lobby.totalCards >= MIN_CARDS_TO_START) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
        }
        // else → wait for window-2
    }

    private async handleSecondPeriodTime(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        lobby.secondWindowFired = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`2nd period time fired for room ${roomId}`);

        if (lobby.totalCards >= MIN_CARDS_TO_START) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
            return;
        }

        // Not enough → start bot fill
        await this.startBotFill(roomId);
    }

    // ─────────────────────────────────────────────────────────────
    // Bot fill
    // ─────────────────────────────────────────────────────────────

    private async startBotFill(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.botFillInProgress) return;

        lobby.botFillInProgress = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`Room ${roomId}: starting bot fill`);

        let attempts = 0;

        while (attempts < MAX_BOT_FILL_ATTEMPTS) {
            attempts++;

            const current = this.lobby.get(roomId);
            if (!current || current.status !== "WAITING") return;

            if (current.totalCards >= MIN_CARDS_TO_START) {
                current.botFillInProgress = false;
                this.lobby.set(roomId, current);
                this.cancelWaiting(roomId);
                await this.finalizeLobby(roomId);
                return;
            }

            const bot = await this.botService.createRandomBot();
            this.addBotToLobby(roomId, bot);

            // Broadcast updated state
            const status = this.getLobbyStatus(roomId);
            this.server?.to(`lobby-${roomId}`).emit("lobby-update", status);

            const allRooms = await this.getAllRoomsWithStatus();
            this.server?.emit("rooms-status", allRooms);

            // Wait 5–15s before next bot
            const delay = BOT_FILL_MIN_DELAY_MS + Math.random() * (BOT_FILL_MAX_DELAY_MS - BOT_FILL_MIN_DELAY_MS);

            await this.sleep(delay);
        }

        // Give up
        const final = this.lobby.get(roomId);
        if (final) {
            final.botFillInProgress = false;
            this.lobby.set(roomId, final);
        }

        this.logger.error(`Room ${roomId}: bot fill gave up after ${attempts} attempts`);
    }

    private addBotToLobby(roomId: string, bot: { username: string; cardCount: number }): void {
        const lobby = this.lobby.get(roomId);
        if (!lobby) return;

        lobby.players.push({
            id: null,
            name: bot.username,
            cardCount: bot.cardCount,
            paidAmount: 0,
            joinedAt: new Date().toISOString()
        });
        lobby.totalCards += bot.cardCount;

        this.lobby.set(roomId, lobby);
    }

    // ─────────────────────────────────────────────────────────────
    // Finalize
    // ─────────────────────────────────────────────────────────────

    private async finalizeLobby(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        lobby.status = "STARTING";
        this.lobby.set(roomId, lobby);

        try {
            const matchId = await this.matchService.startMatch(lobby);

            this.logger.debug(`Match ${matchId} created for room ${roomId}`);

            this.server?.to(`lobby-${roomId}`).emit("match-started", {
                roomId,
                matchId
            });

            const allRooms = await this.getAllRoomsWithStatus();
            this.server?.emit("rooms-status", allRooms);

            this.resetLobby(roomId);
        } catch (error: unknown) {
            this.logger.error(`Failed to start match for room ${roomId}:`, error);

            lobby.status = "WAITING";
            this.lobby.set(roomId, lobby);

            throw error;
        }
    }

    private resetLobby(roomId: string): void {
        const lobby = this.lobby.get(roomId);
        if (!lobby) return;

        lobby.players = [];
        lobby.totalCards = 0;
        lobby.status = "WAITING";
        lobby.createdAt = new Date().toISOString();
        lobby.firstPeriodTimeFired = false;
        lobby.secondWindowFired = false;
        lobby.botFillInProgress = false;

        this.lobby.set(roomId, lobby);
        this.cancelWaiting(roomId);

        this.logger.debug(`Lobby ${roomId} reset`);
    }

    // ─────────────────────────────────────────────────────────────
    // Disconnect
    // ─────────────────────────────────────────────────────────────

    async handleDisconnect(userId: string): Promise<void> {
        const roomId = this.userRoomMap.get(userId);
        if (!roomId) return;

        // Per docs: player is NOT removed. Match continues in backend.
        this.logger.debug(`User ${userId} disconnected from ${roomId} — match continues`);
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private async initializeLobbyRooms(): Promise<void> {
        if (this.lobby.size > 0) return;

        const rooms = await this.roomRepository.findAll();
        rooms.forEach((room) => {
            this.lobby.set(room.id, {
                roomId: room.id,
                createdAt: new Date().toISOString(),
                status: "WAITING",
                players: [],
                totalCards: 0,
                firstPeriodTimeFired: false,
                secondWindowFired: false,
                botFillInProgress: false
            });
        });
    }

    private getRemainingSeconds(createdAt: string): number {
        const created = new Date(createdAt).getTime();
        const elapsed = Math.floor((Date.now() - created) / 1000);
        return Math.max(0, Math.floor(FIRST_LOBBY_WAITING_TIME_MS / 1000) - elapsed);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
