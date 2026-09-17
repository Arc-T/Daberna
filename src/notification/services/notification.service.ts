// src/notification/services/notification.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { NotificationType } from "../../../generated/prisma/client.js";

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Create a notification.
     *
     * Pass `tx` when calling inside a Prisma transaction so the
     * notification is committed atomically with the caller's work.
     */
    async create(tx: any, userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
        const prisma = tx ?? this.prisma;

        await prisma.notification.create({
            data: {
                userId,
                type,
                payload
            }
        });

        this.logger.debug(`Notification ${type} → user ${userId}`);
    }

    async listForUser(userId: string, limit = 50) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: limit
        });
    }

    async markAsRead(userId: string, notificationId: string): Promise<void> {
        await this.prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { readAt: new Date() }
        });
    }

    async unreadCount(userId: string): Promise<number> {
        return this.prisma.notification.count({
            where: { userId, readAt: null }
        });
    }
}
