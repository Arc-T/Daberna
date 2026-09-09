import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { LobbyService } from "../services/lobby.service.js";

@WebSocketGateway({ namespace: "lobby" })
export class LobbyGateway {
    constructor(private readonly lobbyService: LobbyService) {}

    @SubscribeMessage("join-lobby")
    async handleJoinLobby(client: Socket, data: { roomId: string }) {
        return this.lobbyService.joinLobby(client, data);
    }

    @SubscribeMessage("get-all-statuses")
    async handleGetLobbyStatus() {
        return this.lobbyService.getAllLobbyStatuses();
    }
}
