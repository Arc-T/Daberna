import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { User } from "../../../generated/prisma/client.js";

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) {}

    async findOne(username: string): Promise<User> {
        const user = await this.prismaService.user.findFirst({
            where: {
                username: username
            }
        });

        if (!user) throw new NotFoundException(`User with username ${username} not found`);

        return user;
    }
}
