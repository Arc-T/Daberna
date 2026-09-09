import { Injectable } from "@nestjs/common";
import { RoomRepository } from "../repositories/room.repository.js";
import { RoomResponseDto } from "../contracts/response/room-response.dto.js";

@Injectable()
export class RoomService {
    constructor(private readonly roomRepository: RoomRepository) {}

    async getRooms(): Promise<RoomResponseDto[]> {
        const rooms = this.roomRepository.findAll();
        return {

        }
    }
}
