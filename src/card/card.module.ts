import { Module } from "@nestjs/common";
import { CardRepository } from "./repositories/card.repository.js";

@Module({
    providers: [CardRepository],
    exports: [CardRepository]
})
export class CardModule {}
