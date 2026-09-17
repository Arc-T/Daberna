import { Injectable, Logger } from "@nestjs/common";
import { NotificationType } from "../../../generated/prisma/client.js";
import { NotificationService } from "../../notification/services/notification.service.js";

@Injectable()
export class MatchPrizeService {
    private readonly logger = new Logger(MatchPrizeService.name);

    constructor(private readonly notificationService: NotificationService) {}

    /**
     * Settle a single winner.
     * - Real player: credit + WINNING transaction + notification
     * - Bot: log BOT_WINNING (userId=null) + increment Match.botWinnings
     *
     * Runs inside the caller's transaction.
     */
    async settle(
        tx: any,
        params: {
            matchId: string;
            userId: string | null;
            isBot: boolean;
            amount: number;
            description: string;
            notificationType: NotificationType;
        }
    ): Promise<void> {
        const { matchId, userId, isBot, amount, description, notificationType } = params;

        if (amount <= 0) return;

        // ── Bot win
        if (isBot || !userId) {
            await tx.transaction.create({
                data: {
                    userId: null,
                    type: "BOT_WINNING",
                    amount,
                    balanceBefore: 0,
                    balanceAfter: 0,
                    status: "COMPLETED",
                    referenceId: matchId,
                    description: `${description} — برد بات`
                }
            });

            await tx.match.update({
                where: { id: matchId },
                data: { botWinnings: { increment: amount } }
            });

            return;
        }

        // ── Real player win
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { credit: true }
        });
        if (!user) return;

        const updated = await tx.user.update({
            where: { id: userId },
            data: {
                credit: { increment: amount },
                withdrawableBalance: { increment: amount }
            }
        });

        await tx.transaction.create({
            data: {
                userId,
                type: "WINNING",
                amount,
                balanceBefore: Number(user.credit),
                balanceAfter: Number(updated.credit),
                status: "COMPLETED",
                referenceId: matchId,
                description
            }
        });

        await this.notificationService.create(tx, userId, notificationType, {
            matchId,
            amount,
            description
        });
    }

    /**
     * Refund a real player (used on match cancel).
     */
    async refund(tx: any, userId: string, amount: number, matchId: string): Promise<void> {
        if (amount <= 0) return;

        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { credit: true }
        });
        if (!user) return;

        const updated = await tx.user.update({
            where: { id: userId },
            data: { credit: { increment: amount } }
        });

        await tx.transaction.create({
            data: {
                userId,
                type: "GAME_ENTRY",
                amount,
                balanceBefore: Number(user.credit),
                balanceAfter: Number(updated.credit),
                status: "COMPLETED",
                referenceId: matchId,
                description: "بازگشت هزینه ورود — لغو مچ"
            }
        });

        await this.notificationService.create(tx, userId, NotificationType.MATCH_ENDED, {
            matchId,
            refund: amount,
            reason: "cancelled"
        });
    }
}
