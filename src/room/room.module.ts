import { Module } from "@nestjs/common";
import { RoomController } from "./controllers/room.controller.js";
import { RoomService } from "./services/room.service.js";
import { RoomRepository } from "./repositories/room.repository.js";

@Module({
    controllers: [RoomController],
    providers: [RoomRepository, RoomService],
    exports: [RoomRepository, RoomService]
})
export class RoomModule {}
