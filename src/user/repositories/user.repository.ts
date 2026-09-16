import { Injectable } from "@nestjs/common";
import { Prisma, User } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Injectable()
export class UserRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id }
        });
    }

    async findByUsername(username: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { username }
        });
    }

    async findByInviteCode(inviteCode: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { inviteCode }
        });
    }

    async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({ data });
    }

    async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data
        });
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { username },
            select: { id: true }
        });
        return !!user;
    }

    async isPhoneNumberTaken(phoneNumber: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            select: { id: true }
        });
        return !!user;
    }

    async updateCredit(id: string, amount: number): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data: {
                credit: { increment: amount }
            }
        });
    }
}
