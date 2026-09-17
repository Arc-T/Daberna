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
import { UsePipes, ValidationPipe } from "@nestjs/common";
import { LobbyService } from "../services/lobby.service.js";
import { SkipAuth } from "../../common/decorators/skipt-auth.decorator.js";
import { WatchLobbyDto, UnwatchLobbyDto, JoinLobbyDto } from "../contracts/requests/index.js";

@SkipAuth()
@WebSocketGateway({
    namespace: "lobby",
    cors: { origin: "*" }
})
@UsePipes(
    new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
    })
)
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(private readonly lobbyService: LobbyService) {}

    afterInit(server: Server) {
        this.lobbyService.setServer(server);
    }

    async handleConnection(client: Socket) {
        await this.lobbyService.onClientConnected(client);
    }

    async handleDisconnect(client: Socket) {
        await this.lobbyService.onClientDisconnected(client);
    }

    @SubscribeMessage("watch-lobby")
    async handleWatchLobby(@ConnectedSocket() client: Socket, @MessageBody() dto: WatchLobbyDto) {
        return this.lobbyService.watchLobby(client, dto.roomId);
    }

    @SubscribeMessage("unwatch-lobby")
    async handleUnwatchLobby(@ConnectedSocket() client: Socket, @MessageBody() dto: UnwatchLobbyDto) {
        return this.lobbyService.unwatchLobby(client, dto.roomId);
    }

    @SubscribeMessage("join-lobby")
    async handleJoinLobby(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinLobbyDto) {
        return this.lobbyService.joinLobby(client, dto);
    }
}
