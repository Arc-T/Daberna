import { Injectable, Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { WsException } from "@nestjs/websockets";

import { LobbyResponseDto, LobbyState } from "../contracts/requests/lobby-request.dto.js";
import { JoinLobbyDto } from "../contracts/requests/join-lobby.dto.js";

import { RoomRepository } from "../../room/repositories/room.repository.js";
import { RoomStatusDto } from "../../room/contracts/response/room-status.dto.js";
import {
    MIN_ROOM_CARDS,
    MAX_ROOM_CARDS,
    MAX_CARDS_PER_MATCH,
    MIN_CARDS_TO_START
} from "../../room/contracts/constants/room.constant.js";
import {
    FIRST_WINDOW_MS as FIRST_LOBBY_WAITING_TIME_MS,
    SECOND_WINDOW_MS as SECOND_LOBBY_WAITING_TIME_MS,
    BOT_FILL_MIN_DELAY_MS,
    BOT_FILL_MAX_DELAY_MS,
    BOT_FILL_START_SECOND,
    BOT_FILL_END_SECOND,
    MAX_BOTS_PER_MATCH
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

    async onClientConnected(client: Socket): Promise<void> {
        this.logger.debug(`client connected: ${client.id}`);
        try {
            const rooms = await this.getAllRoomsWithStatus();
            client.emit("rooms-status", rooms);
        } catch (err) {
            this.logger.error(`failed to send rooms-status to ${client.id}`, err);
            client.disconnect();
        }
    }

    async onClientDisconnected(client: Socket): Promise<void> {
        const userId = client.data.userId as string | undefined;
        if (!userId) {
            this.logger.debug(`client ${client.id} disconnected (never joined)`);
            return;
        }

        await this.handleDisconnect(userId);
    }

    // ─────────────────────────────────────────────────────────────
    // Watch / Unwatch (passive)
    // ─────────────────────────────────────────────────────────────

    async watchLobby(client: Socket, roomId: string): Promise<{ success: boolean; roomId: string }> {
        client.join(`lobby-${roomId}`);

        const status = this.getLobbyStatus(roomId);
        client.emit("lobby-update", status);

        return { success: true, roomId };
    }

    async unwatchLobby(client: Socket, roomId: string): Promise<{ success: boolean }> {
        client.leave(`lobby-${roomId}`);
        return { success: true };
    }

    // ─────────────────────────────────────────────────────────────
    // Join (active)
    // ─────────────────────────────────────────────────────────────

    async joinLobby(client: Socket, dto: JoinLobbyDto): Promise<LobbyState> {
        const lobby = await this.enterLobby(dto.userId, dto.name, dto.roomId, dto.cardCount);

        // Track on socket for disconnect handling
        client.data.userId = dto.userId;
        client.data.roomId = dto.roomId;
        client.join(`lobby-${dto.roomId}`);

        // Acknowledge to the caller
        client.emit("joined-lobby", {
            success: true,
            roomId: dto.roomId,
            cardCount: dto.cardCount,
            totalCards: lobby.totalCards
        });

        // Fan out
        await this.broadcastRoomUpdates(dto.roomId);

        return lobby;
    }

    // ─────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────

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
    // Broadcast
    // ─────────────────────────────────────────────────────────────

    private async broadcastRoomUpdates(roomId: string): Promise<void> {
        const status = this.getLobbyStatus(roomId);
        this.server?.to(`lobby-${roomId}`).emit("lobby-update", status);

        const allRooms = await this.getAllRoomsWithStatus();
        this.server?.emit("rooms-status", allRooms);
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
        const user = await this.userRepository.findById(userId);
        if (!user) throw new WsException("کاربر یافت نشد.");

        const cost = cardCount * Number(room.entryFee);
        if (Number(user.credit) < cost) {
            throw new WsException("موجودی کافی نیست.");
        }

        // ── Referral co-room rule (Daberna-2, page 60)
        // inviter and invitee must NOT share a room
        await this.assertNoReferralConflict(userId, lobby);

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
        const wasEmpty = lobby.players.length === 0;

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

        // ── First player → schedule windows + bot entry timer
        if (wasEmpty) {
            this.scheduleWaiting(roomId);
            this.scheduleBotEntry(roomId);
        }

        // ── Instant full → cancel + finalize
        if (lobby.totalCards >= MAX_CARDS_PER_MATCH) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
        }

        return lobby;
    }

    // ─────────────────────────────────────────────────────────────
    // Referral co-room guard
    // ─────────────────────────────────────────────────────────────

    /**
     * Daberna-2, page 60:
     *   The inviter and invitee cannot share a room or a match.
     */
    private async assertNoReferralConflict(userId: string, lobby: LobbyState): Promise<void> {
        const myReferrer = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { referrerId: true }
        });

        const myReferrals = await this.prisma.referral.findMany({
            where: { referrerId: userId },
            select: { referredUserId: true }
        });

        const myReferrerId = myReferrer?.referrerId ?? null;
        const myReferralIds = myReferrals.map((r) => r.referredUserId);

        const conflict = lobby.players.some(
            (p) => p.id !== null && (p.id === myReferrerId || myReferralIds.includes(p.id))
        );

        if (conflict) {
            throw new WsException("شما و دعوت‌کننده/دعوت‌شده‌ی شما نمی‌توانید در یک روم باشید.");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Waiting windows
    // ─────────────────────────────────────────────────────────────

    private scheduleWaiting(roomId: string): void {
        if (this.lobbyTimers.has(roomId)) return;

        const t1 = setTimeout(() => {
            this.handleFirstPeriodTime(roomId).catch((err) =>
                this.logger.error(`first period failed for ${roomId}`, err)
            );
        }, FIRST_LOBBY_WAITING_TIME_MS);

        const t2 = setTimeout(() => {
            this.handleSecondPeriodTime(roomId).catch((err) =>
                this.logger.error(`second period failed for ${roomId}`, err)
            );
        }, FIRST_LOBBY_WAITING_TIME_MS + SECOND_LOBBY_WAITING_TIME_MS);

        this.lobbyTimers.set(roomId, [t1, t2]);

        this.logger.debug(`Scheduled waiting windows for room ${roomId}`);
    }

    private cancelWaiting(roomId: string): void {
        const timers = this.lobbyTimers.get(roomId);
        if (!timers) return;

        timers.forEach(clearTimeout);
        this.lobbyTimers.delete(roomId);

        this.logger.debug(`Cancelled waiting windows for room ${roomId}`);
    }

    private async handleFirstPeriodTime(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        lobby.firstPeriodTimeFired = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`First period fired for room ${roomId}`);

        if (lobby.totalCards >= MIN_CARDS_TO_START) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
        }
        // else → wait for the second period
    }

    private async handleSecondPeriodTime(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        lobby.secondPeriodTimeFired = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`Second period fired for room ${roomId}`);

        if (lobby.totalCards >= MIN_CARDS_TO_START) {
            this.cancelWaiting(roomId);
            await this.finalizeLobby(roomId);
            return;
        }

        // Not enough players → start bot fill
        await this.startBotFill(roomId);
    }

    // ─────────────────────────────────────────────────────────────
    // Bot fill (Daberna-2, pages 27–28)
    //
    //   • Bots start joining from second 20
    //   • Bots stop joining at second 80
    //   • Max 15 bots per match
    //   • Interval between bot joins: 5–15s (Remote Config)
    //   • Stop early if totalCards ≥ 5 (min to start)
    // ─────────────────────────────────────────────────────────────

    private scheduleBotEntry(roomId: string): void {
        setTimeout(() => {
            this.onBotEntryWindowOpen(roomId).catch((err) => this.logger.error(`bot entry failed for ${roomId}`, err));
        }, BOT_FILL_START_SECOND * 1000);
    }

    private async onBotEntryWindowOpen(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.status !== "WAITING") return;

        // If already at minimum before the window opened, skip
        if (lobby.totalCards >= MIN_CARDS_TO_START) return;

        await this.startBotFill(roomId);
    }

    private async startBotFill(roomId: string): Promise<void> {
        const lobby = this.lobby.get(roomId);
        if (!lobby || lobby.botFillInProgress) return;

        lobby.botFillInProgress = true;
        this.lobby.set(roomId, lobby);

        this.logger.debug(`Room ${roomId}: starting bot fill`);

        const windowStart = new Date(lobby.createdAt).getTime();
        let botsAdded = 0;

        while (botsAdded < MAX_BOTS_PER_MATCH) {
            // Guard: stop if the entry window has closed
            const elapsedSec = (Date.now() - windowStart) / 1000;
            if (elapsedSec >= BOT_FILL_END_SECOND) {
                this.logger.debug(`Room ${roomId}: bot entry window closed at ${elapsedSec.toFixed(0)}s`);
                break;
            }

            const current = this.lobby.get(roomId);
            if (!current || current.status !== "WAITING") return;

            // Stop when we have enough cards to start
            if (current.totalCards >= MIN_CARDS_TO_START) {
                current.botFillInProgress = false;
                this.lobby.set(roomId, current);
                this.cancelWaiting(roomId);
                await this.finalizeLobby(roomId);
                return;
            }

            const bot = await this.botService.createRandomBot();
            this.addBotToLobby(roomId, bot);
            botsAdded++;

            // Broadcast updated state
            await this.broadcastRoomUpdates(roomId);

            // Wait between 5–15s before the next bot
            const delay = BOT_FILL_MIN_DELAY_MS + Math.random() * (BOT_FILL_MAX_DELAY_MS - BOT_FILL_MIN_DELAY_MS);

            await this.sleep(delay);
        }

        // If we exit the loop, we either hit MAX_BOTS or the window closed
        const final = this.lobby.get(roomId);
        if (final) {
            final.botFillInProgress = false;
            this.lobby.set(roomId, final);

            // If we still have ≥ MIN cards, finalize
            if (final.totalCards >= MIN_CARDS_TO_START) {
                this.cancelWaiting(roomId);
                await this.finalizeLobby(roomId);
                return;
            }
        }

        this.logger.warn(
            `Room ${roomId}: bot fill ended with ${final?.totalCards ?? 0} cards (needs ${MIN_CARDS_TO_START})`
        );
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

            // 👇 Start number calling
            await this.matchService.beginNumberCalling(matchId);

            this.server?.to(`lobby-${roomId}`).emit("match-started", {
                roomId,
                matchId
            });

            await this.broadcastRoomUpdates(roomId);
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
        lobby.secondPeriodTimeFired = false;
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
                secondPeriodTimeFired: false,
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
