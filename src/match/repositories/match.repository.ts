import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { MatchStatus } from "../../../generated/prisma/enums.js";

@Injectable()
export class MatchRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(matchId: string) {
        return this.prisma.match.findUnique({
            where: { id: matchId },
            include: {
                room: true,
                playerMatches: {
                    include: {
                        user: { select: { id: true, username: true, isNewPlayer: true } },
                        matchCards: {
                            include: {
                                card: true // 👈 needed for `mc.card.numbers` and `mc.card.layout`
                            }
                        }
                    }
                },
                matchNumbers: {
                    orderBy: { orderIndex: "asc" }
                }
            }
        });
    }

    async findActiveByRoom(roomId: string) {
        return this.prisma.match.findMany({
            where: {
                roomId,
                status: { in: [MatchStatus.WAITING, MatchStatus.STARTED, MatchStatus.LINE_COMPLETED] }
            },
            include: {
                playerMatches: true
            },
            orderBy: { createdAt: "desc" }
        });
    }

    async appendCalledNumber(matchId: string, number: number) {
        const match = await this.prisma.match.findUnique({
            where: { id: matchId },
            select: { calledNumbers: true }
        });
        if (!match) return null;

        const called = (match.calledNumbers as number[]) ?? [];
        called.push(number);

        return this.prisma.match.update({
            where: { id: matchId },
            data: {
                calledNumbers: called,
                matchNumbers: {
                    create: {
                        number,
                        orderIndex: called.length - 1
                    }
                }
            }
        });
    }

    async setLineWinner(matchId: string, userId: string, prize: number) {
        return this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.LINE_COMPLETED,
                lineWinnerId: userId,
                linePrize: prize
            }
        });
    }

    async setFullHouseWinner(matchId: string, userId: string, prize: number) {
        return this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.COMPLETED,
                fullHouseWinnerId: userId,
                fullHousePrize: prize,
                endTime: new Date()
            }
        });
    }

    async markCompleted(matchId: string) {
        return this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.COMPLETED,
                endTime: new Date()
            }
        });
    }

    async markCancelled(matchId: string) {
        return this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: MatchStatus.CANCELLED,
                endTime: new Date()
            }
        });
    }
}
