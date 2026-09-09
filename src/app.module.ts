import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { UserModule } from "./user/user.module.js";
import { ReferralModule } from "./referral/referral.module.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { CommonModule } from "./common/common.module.js";
import { ConfigModule } from "@nestjs/config";
import { ProfileModule } from './profile/profile.module.js';
import { RoomModule } from './room/room.module';
import { LobbyModule } from './lobby/lobby.module.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true
        }),
        PrismaModule,
        CommonModule,
        AuthModule,
        UserModule,
        ReferralModule,
        ProfileModule,
        RoomModule,
        LobbyModule
    ]
})
export class AppModule {}
