import { Module } from "@nestjs/common";
import { ProfileService } from "./services/profile.service.js";
import { ProfileController } from "./controllers/profile.controller.js";
import { UserModule } from "../user/user.module.js";

@Module({
    imports: [UserModule],
    providers: [ProfileService],
    controllers: [ProfileController]
})
export class ProfileModule {}
