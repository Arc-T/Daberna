import { Module } from "@nestjs/common";
import { InviteCodeService } from "./services/inviteCode.service.js";
import { ReferralService } from "./services/referral.service.js";

@Module({
    providers: [InviteCodeService, ReferralService],
    exports: [ReferralService, InviteCodeService]
})
export class ReferralModule {}
