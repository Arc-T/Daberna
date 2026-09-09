import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { User } from "../../common/decorators/user.decorator.js";
import type { JwtPayload } from "../../common/types/jwt-payload.js";
import { ProfileService } from "../services/profile.service.js";

@Controller("profile")
export class ProfileController {
    constructor(private readonly profileService: ProfileService) {}

    @Post("me")
    @HttpCode(HttpStatus.OK)
    async myInfo(@User() user: JwtPayload) {
        return this.profileService.getMyProfile(user);
    }
}
