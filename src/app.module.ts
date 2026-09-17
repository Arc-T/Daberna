import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { UserModule } from "./user/user.module.js";
import { ReferralModule } from "./referral/referral.module.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { CommonModule } from "./common/common.module.js";
import { ConfigModule } from "@nestjs/config";
import { ProfileModule } from './profile/profile.module.js';
import { LobbyModule } from './lobby/lobby.module.js';
import { RoomModule } from "./room/room.module.js";
import { TransactionModule } from './transaction/transaction.module.js';
import { CardModule } from './card/card.module.js';
import { MatchModule } from './match/match.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { BotModule } from './bot/bot.module.js';
import { NotificationModule } from './notification/notification.module.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true
        }),
        ScheduleModule.forRoot(),
        PrismaModule,
        CommonModule,
        AuthModule,
        UserModule,
        ReferralModule,
        ProfileModule,
        RoomModule,
        LobbyModule,
        TransactionModule,
        CardModule,
        MatchModule,
        BotModule,
        NotificationModule
    ]
})
export class AppModule {}
