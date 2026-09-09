import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { LobbyResponseDto, LobbyState } from "../contracts/requests/lobby-request.js";
import { RoomRepository } from "../../room/repositories/room.repository.js";
import { WebSocketServer } from "@nestjs/websockets";

@Injectable()
export class LobbyService {
    @WebSocketServer()
    private server: Server;

    private static lobbyStates = new Map<string, LobbyState>();

    constructor(private readonly roomRepository: RoomRepository) {
        this.initializeLobbies();
    }

    private async initializeLobbies() {
        if (LobbyService.lobbyStates.size === 0) {
            const rooms = await this.roomRepository.findAll();
            rooms.forEach((room) => {
                LobbyService.lobbyStates.set(room.id, {
                    roomId: room.id,
                    createdAt: new Date().toISOString(),
                    status: "WAITING",
                    players: [],
                    totalCards: 0
                });
            });
        }
    }

    async joinLobby(client: Socket, request: { roomId: string }): Promise<void> {
        client.join(`lobby-${request.roomId}`);
    }

    async enterLobby(userId: string, name: string, roomId: string, cardCount: number) {
        // Validate room exists
        const room = await this.roomRepository.findById(roomId);
        if (!room) {
            throw new NotFoundException("روم نامعتبر است.");
        }

        const lobby = LobbyService.lobbyStates.get(roomId)!;

        if (lobby.players.length >= 4) {
            throw new BadRequestException("لابی کامل است.");
        }

        const existingPlayer = lobby.players.find((p) => p.id === userId);
        if (existingPlayer) {
            throw new ConflictException("کاربر در حال حاضر در این لابی است.");
        }

        lobby.players.push({
            id: userId,
            name: name,
            cardCount: cardCount
        });

        lobby.totalCards += cardCount;
        
        LobbyService.lobbyStates.set(roomId, lobby);

        // Emit update to all clients in this room's lobby
        this.emitLobbyUpdate(roomId);

        // Check if 30 cards reached (instant match start)
        if (lobby.totalCards >= 30) {
            await this.startMatch(roomId);
        }

        return lobby;
    }

    private emitLobbyUpdate(roomId: string): void {
        const status = this.getAllLobbyStatuses(roomId);
        this.server.to(`lobby-${roomId}`).emit("lobby-update", status);
    }

    getAllLobbyStatuses(roomId: string): LobbyResponseDto {
        const lobby = LobbyService.lobbyStates.get(roomId);
        if (!lobby) {
            throw new NotFoundException("لابی پیدا نشد.");
        }

        return {
            roomId,
            totalCards: lobby.totalCards,
            playerCount: lobby.players.length,
            waitingTime: this.getWaitingTime(lobby.createdAt),
            minCards: 1,
            maxCards: 4,
            status: lobby.status
        };
    }

    private getWaitingTime(createdAt: string): string {
        const created = new Date(createdAt);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
        
        if (diffInSeconds < 60) {
            return `${diffInSeconds} ثانیه`;
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} دقیقه`;
        } else {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            return `${hours} ساعت و ${minutes} دقیقه`;
        }
    }

    private async startMatch(roomId: string): Promise<void> {
        const lobby = LobbyService.lobbyStates.get(roomId);
        if (!lobby) return;

        // Update lobby status
        lobby.status = "STARTING";
        LobbyService.lobbyStates.set(roomId, lobby);

        // Notify clients
        this.emitLobbyUpdate(roomId);

        // Here you would start the actual match
        console.log(`Match starting for room ${roomId} with ${lobby.players.length} players`);
        
        // After match starts, update status
        // lobby.status = "STARTED";
        // LobbyService.lobbyStates.set(roomId, lobby);
    }

    // Additional helper methods
    getPlayerCount(roomId: string): number {
        const lobby = LobbyService.lobbyStates.get(roomId);
        return lobby?.players.length || 0;
    }

    isLobbyFull(roomId: string): boolean {
        const lobby = LobbyService.lobbyStates.get(roomId);
        return lobby ? lobby.players.length >= 4 : true;
    }

    async leaveLobby(userId: string, roomId: string): Promise<void> {
        const lobby = LobbyService.lobbyStates.get(roomId);
        if (!lobby) {
            throw new NotFoundException("لابی پیدا نشد.");
        }

        const playerIndex = lobby.players.findIndex(p => p.id === userId);
        if (playerIndex === -1) {
            throw new NotFoundException("کاربر در لابی یافت نشد.");
        }

        // Remove player
        const removedPlayer = lobby.players.splice(playerIndex, 1)[0];
        lobby.totalCards -= removedPlayer.cardCount;

        if (lobby.players.length === 0) {
            // If no players left, reset lobby
            lobby.totalCards = 0;
            lobby.status = "WAITING";
        }

        LobbyService.lobbyStates.set(roomId, lobby);
        this.emitLobbyUpdate(roomId);
    }

    // Cleanup method for disconnected clients
    handleDisconnect(userId: string): void {
        // Find and remove user from any lobby they're in
        for (const [roomId, lobby] of LobbyService.lobbyStates) {
            const playerIndex = lobby.players.findIndex(p => p.id === userId);
            if (playerIndex !== -1) {
                const removedPlayer = lobby.players.splice(playerIndex, 1)[0];
                lobby.totalCards -= removedPlayer.cardCount;
                
                if (lobby.players.length === 0) {
                    lobby.totalCards = 0;
                    lobby.status = "WAITING";
                }
                
                LobbyService.lobbyStates.set(roomId, lobby);
                this.emitLobbyUpdate(roomId);
                break;
            }
        }
    }

    // Get all lobbies (for admin/debugging)
    getAllLobbies(): LobbyState[] {
        return Array.from(LobbyService.lobbyStates.values());
    }
}