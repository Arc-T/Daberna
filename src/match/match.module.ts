import { Module } from "@nestjs/common";

import { MatchService } from "./services/match.service.js";
import { MatchCardService } from "./services/match-card.service.js";
import { WinnerDetectorService } from "./services/winner-detector.service.js";
import { NumberCallerService } from "./services/number-caller.service.js";
import { MatchPrizeService } from "./services/match-prize.service.js";
import { MatchRepository } from "./repositories/match.repository.js";
import { MatchGateway } from "./gateways/match.gateway.js";

import { RoomModule } from "../room/room.module.js";
import { NotificationModule } from "../notification/notification.module.js";

@Module({
    imports: [RoomModule, NotificationModule],
    providers: [
        MatchService,
        MatchCardService,
        WinnerDetectorService,
        NumberCallerService,
        MatchPrizeService,
        MatchRepository,
        MatchGateway
    ],
    exports: [MatchService, MatchRepository]
})
export class MatchModule {}
