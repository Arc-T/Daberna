import { Module } from "@nestjs/common";
import { LobbyGateway } from "./gateways/lobby.gateway.js";
import { LobbyService } from "./services/lobby.service.js";
import { RoomModule } from "../room/room.module.js";
import { UserModule } from "../user/user.module.js";

@Module({
    imports: [RoomModule, UserModule],
    providers: [LobbyGateway, LobbyService]
})
export class LobbyModule {}
