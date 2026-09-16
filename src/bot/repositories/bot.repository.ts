import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Injectable()
export class BotRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Check whether a username is already taken by a real user.
     * Bots don't have User rows, so this only checks the User table.
     */
    async isUsernameTaken(username: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { username },
            select: { id: true }
        });
        return !!user;
    }
}
