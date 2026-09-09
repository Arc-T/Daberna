import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { Room } from "../../../generated/prisma/browser.js";

@Injectable()
export class RoomRepository {
    constructor(private readonly prismaService: PrismaService) {}

    async findAll(): Promise<Room[]> {
        return this.prismaService.room.findMany();
    }

    async findById(id: string): Promise<Room | null> {
        return this.prismaService.room.findUnique({
            where: { id }
        });
    }
}
