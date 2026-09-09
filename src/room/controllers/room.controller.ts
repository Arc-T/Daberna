import { Body, Controller, Get, Post } from "@nestjs/common";
import { User } from "../../common/decorators/user.decorator.js";
import { RoomService } from "../services/room.service.js";

@Controller("rooms")
export class RoomController {
    constructor(private readonly roomService: RoomService) {}
    @Get()
    getRooms() {
        return this.roomService.getRooms();
    }

    @Post("enter")
    enterRoom(@User("sub") userId: string, @Body() request: EnterRoomDto) {
        return this.roomService.enterRoom(userId, request);
    }
}
