import { Module } from "@nestjs/common";
import { BotService } from "./services/bot.service.js";
import { BotRepository } from "./repositories/bot.repository.js";

@Module({
    providers: [BotService, BotRepository],
    exports: [BotService, BotRepository]
})
export class BotModule {}
