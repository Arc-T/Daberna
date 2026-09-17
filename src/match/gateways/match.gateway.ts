import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    ConnectedSocket,
    MessageBody
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";

import { MatchService } from "../services/match.service.js";
import { SkipAuth } from "../../common/decorators/skipt-auth.decorator.js";
import { WatchMatchDto, UnwatchMatchDto } from "../contracts/index.js";

@SkipAuth()
@WebSocketGateway({
    namespace: "match",
    cors: { origin: "*" }
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    private readonly logger = new Logger(MatchGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(private readonly matchService: MatchService) {}

    afterInit(server: Server) {
        // Give the service a reference so it can emit `number-called`, etc.
        this.matchService.setServer(server);
    }

    async handleConnection(client: Socket) {
        this.logger.debug(`match client connected: ${client.id}`);
    }

    async handleDisconnect(client: Socket) {
        this.logger.debug(`match client disconnected: ${client.id}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Watch / Unwatch
    // ─────────────────────────────────────────────────────────────

    @SubscribeMessage("watch-match")
    async handleWatchMatch(@ConnectedSocket() client: Socket, @MessageBody() dto: WatchMatchDto) {
        client.join(`match-${dto.matchId}`);

        const userId = client.data.userId as string | undefined;

        try {
            const snapshot = await this.matchService.getSnapshot(dto.matchId, userId);
            client.emit("match-snapshot", snapshot);
        } catch (err) {
            throw new WsException("مچ پیدا نشد یا در دسترس نیست.");
        }

        return { success: true, matchId: dto.matchId };
    }

    @SubscribeMessage("unwatch-match")
    async handleUnwatchMatch(@ConnectedSocket() client: Socket, @MessageBody() dto: UnwatchMatchDto) {
        client.leave(`match-${dto.matchId}`);
        return { success: true };
    }
}
