import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Injectable()
export class ReferralService {
    constructor(private readonly prismaService: PrismaService) {}

    async validateReferrer(inviteCode: string): Promise<string> {
        const referrer = await this.prismaService.user.findUnique({
            where: { inviteCode }
        });

        if (!referrer) {
            throw new BadRequestException("کد دعوت نامعتبر است");
        }

        return referrer.id;
    }

    async createReferral(referrerId: string, referredUserId: string) {
        const existing = await this.prismaService.referral.findUnique({
            where: { referredUserId }
        });

        if (existing) {
            throw new BadRequestException("این کاربر قبلاً دعوت شده است");
        }

        return this.prismaService.referral.create({
            data: {
                referrerId,
                referredUserId,
                rewardAmount: 0,
                status: "PENDING"
            }
        });
    }
}
