import { Injectable, NotFoundException } from "@nestjs/common";
import { User } from "../../common/decorators/user.decorator.js";
import type { JwtPayload } from "../../common/types/jwt-payload.js";
import { UserRepository } from "../../user/repositories/user.repository.js";
import { ProfileResponseDto } from "../contracts/response/profile-response.dto.js";

@Injectable()
export class ProfileService {
    constructor(private readonly userRepository: UserRepository) {}

    async getMyProfile(@User() user: JwtPayload): Promise<ProfileResponseDto> {
        const userInfo = await this.userRepository.findById(user.sub);
        if (!userInfo) {
            throw new NotFoundException("مشخصات کاربر یافت نشد.");
        }
        return {
            username: userInfo.username,
            inviteCode: userInfo.inviteCode,
            email: userInfo.email,
            phoneNumber: userInfo.phoneNumber,
            fulleName: userInfo.fullName,
            shebaNumber: userInfo.shebaNumber
        };
    }
}
