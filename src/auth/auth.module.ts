import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./controllers/auth.controller.js";
import { AuthService } from "./services/auth.service.js";
import { UserModule } from "../user/user.module.js";
import { AuthGuard } from "../common/guards/auth.gaurd.js";
import { ReferralModule } from "../referral/referral.module.js";

@Module({
    imports: [
        UserModule,
        ReferralModule,
        JwtModule.register({
            global: true,
            secret: "cab8191332b428340739af4b412d1fa9b9c38dbc1c44a295de9c1834a157b673",
            signOptions: {
                expiresIn: "30d",
                algorithm: "HS256",
                issuer: "Manataz"
            }
        })
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        {
            provide: APP_GUARD,
            useClass: AuthGuard
        }
    ],
    exports: [AuthService]
})
export class AuthModule {}
