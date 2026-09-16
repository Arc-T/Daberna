import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    ConnectedSocket,
    MessageBody,
    WsException
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { LobbyService } from "../services/lobby.service.js";
import { Logger } from "@nestjs/common";
import { SkipAuth } from "../../common/decorators/skipt-auth.decorator.js";
import { MatchService } from "../../match/services/match.service.js";

@SkipAuth()
@WebSocketGateway({
    namespace: "lobby",
    cors: { origin: "*" }
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    private readonly logger = new Logger(LobbyGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(
        private readonly lobbyService: LobbyService
    ) {}

    afterInit(server: Server) {
        this.lobbyService.setServer(server);
    }

    async handleConnection(client: Socket) {
        this.logger.debug(`client connected: ${client.id}`);
        try {
            const rooms = await this.lobbyService.getAllRoomsWithStatus();
            client.emit("rooms-status", rooms);
        } catch (err) {
            this.logger.error(`failed to send rooms-status to ${client.id}`, err);
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const userId = client.data.userId!;
        this.logger.log(`User ${userId} disconnected - match continues in backend`);
    }

    @SubscribeMessage("watch-lobby")
    async handleWatchLobby(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
        client.join(`lobby-${data.roomId}`);
        const status = this.lobbyService.getLobbyStatus(data.roomId);
        client.emit("lobby-update", status);
        return { success: true, roomId: data.roomId };
    }

    @SubscribeMessage("unwatch-lobby")
    async handleUnwatchLobby(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
        client.leave(`lobby-${data.roomId}`);
        return { success: true };
    }

    @SubscribeMessage("join-lobby")
    async handleJoinLobby(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; name: string; roomId: string; cardCount: number }
    ) {
        // Validate card count
        if (data.cardCount < 1 || data.cardCount > 4) {
            throw new WsException("تعداد کارت باید بین ۱ تا ۴ باشد");
        }

        const lobby = await this.lobbyService.enterLobby(data.userId, data.name, data.roomId, data.cardCount);

        // Track user state on socket
        client.data.userId = data.userId;
        client.data.roomId = data.roomId;
        client.join(`lobby-${data.roomId}`);

        // Notify the joining client
        client.emit("joined-lobby", {
            success: true,
            roomId: data.roomId,
            cardCount: data.cardCount,
            totalCards: lobby.totalCards
        });

        // Broadcast updates to everyone
        await this.broadcastRoomUpdates(data.roomId);

        return lobby;
    }

    private async broadcastRoomUpdates(roomId: string) {
        const status = this.lobbyService.getLobbyStatus(roomId);
        this.server.to(`lobby-${roomId}`).emit("lobby-update", status);

        const allRooms = await this.lobbyService.getAllRoomsWithStatus();
        this.server.emit("rooms-status", allRooms);
    }
}
