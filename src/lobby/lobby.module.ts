import { Module } from "@nestjs/common";
import { LobbyGateway } from "./gateways/lobby.gateway.js";
import { LobbyService } from "./services/lobby.service.js";
import { RoomModule } from "../room/room.module.js";
import { UserModule } from "../user/user.module.js";
import { BotModule } from "../bot/bot.module.js";
import { MatchModule } from "../match/match.module.js";

@Module({
    imports: [RoomModule, UserModule, BotModule, MatchModule],
    providers: [LobbyGateway, LobbyService],
    exports: [LobbyService]
})
export class LobbyModule {}
