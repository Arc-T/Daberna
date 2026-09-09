import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Injectable()
export class InviteCodeService {
    constructor(private readonly prismaService: PrismaService) {}

    async generateUniqueCode(): Promise<string> {
        let code: string = "";
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 100;

        while (!isUnique && attempts < maxAttempts) {
            code = this.generateRandomCode();
            const existing = await this.prismaService.user.findUnique({
                where: { inviteCode: code }
            });

            if (!existing) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            throw new InternalServerErrorException("خطا در تولید کد دعوت منحصربه‌فرد");
        }

        return code;
    }

    private generateRandomCode(): string {
        const min = 100000;
        const max = 999999;
        return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }
}
