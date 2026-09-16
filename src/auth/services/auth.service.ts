import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InviteCodeService } from "../../referral/services/inviteCode.service.js";
import { ReferralService } from "../../referral/services/referral.service.js";
import { PasswordService } from "../../common/services/password.service.js";
import { SignInDto } from "../contracts/request/sign-in.dto.js";
import { RegisterGuestDto } from "../contracts/request/register-guest.dto.js";
import { CompleteAccountDto } from "../contracts/request/complete-account.dto.js";
import { UserRepository } from "../../user/repositories/user.repository.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { RegisterGuestResponseDto } from "../contracts/response/auth-response.dto.js";
import { CompleteAccountResponseDto } from "../contracts/response/complete-account-response.dto.js";
import { SignInResponseDto } from "../contracts/response/signIn-response.dto.js";

@Injectable()
export class AuthService {
    private readonly GIFT_AMOUNT = 50000;
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly prismaService: PrismaService,
        private readonly userRepository: UserRepository,
        private readonly referralService: ReferralService,
        private readonly passwordService: PasswordService,
        private readonly inviteCodeService: InviteCodeService
    ) {}

    async registerGuest(dto: RegisterGuestDto): Promise<RegisterGuestResponseDto> {
        const { username, inviteCode } = dto;

        if (await this.userRepository.isUsernameTaken(username)) {
            throw new ConflictException("این نام کاربری قبلاً ثبت شده است");
        }

        const userInviteCode = await this.inviteCodeService.generateUniqueCode();

        const referrerId = inviteCode ? await this.referralService.validateReferrer(inviteCode) : null;

        try {
            const newUser = await this.prismaService.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        username,
                        inviteCode: userInviteCode,
                        isGuest: true,
                        isNewPlayer: true,
                        completedGames: 0,
                        credit: this.GIFT_AMOUNT,
                        withdrawableBalance: 0,
                        referralRewardUsed: false,
                        ...(referrerId && { referrer: { connect: { id: referrerId } } })
                    }
                });

                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        type: "GIFT",
                        amount: this.GIFT_AMOUNT,
                        balanceBefore: 0,
                        balanceAfter: this.GIFT_AMOUNT,
                        status: "COMPLETED",
                        description: "هدیه خوش‌آمدگویی - اعتبار اولیه"
                    }
                });

                if (referrerId) {
                    await tx.referral.create({
                        data: {
                            referrerId,
                            referredUserId: user.id,
                            rewardAmount: 0,
                            status: "PENDING"
                        }
                    });
                }

                return user;
            });

            this.logger.debug(`Guest user created: ${newUser.id} (${username})`);

            const token = await this.jwtService.signAsync({
                sub: newUser.id,
                username: username,
                email: newUser.email,
                role: "PLAYER"
            });

            return RegisterGuestResponseDto.toDto(newUser, token, referrerId);
        } catch (error: any) {
            this.logger.error(`Registration failed for ${username}:`, error);
            throw new InternalServerErrorException("خطا در ثبت‌نام. لطفاً دوباره تلاش کنید");
        }
    }

    async signIn(dto: SignInDto): Promise<SignInResponseDto> {
        const { username, password } = dto;

        this.logger.log(`Sign in attempt: ${username}`);

        const user = await this.userRepository.findByUsername(username);

        if (!user) {
            throw new UnauthorizedException("نام کاربری یا رمز عبور اشتباه است");
        }

        if (user.isGuest || !user.password) {
            throw new UnauthorizedException("این حساب کاربری رمز عبور ندارد. لطفاً ابتدا حساب خود را تکمیل کنید");
        }

        const isPasswordValid = await this.passwordService.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException("نام کاربری یا رمز عبور اشتباه است");
        }

        const token = await this.jwtService.signAsync({
            sub: user.id,
            username: user.username
        });

        this.logger.log(`User signed in: ${username}`);

        return SignInResponseDto.toDto(user, token);
    }

    async completeAccount(userId: string, dto: CompleteAccountDto): Promise<CompleteAccountResponseDto> {
        const { phoneNumber, password, email, fullName, shebaNumber } = dto;

        this.logger.log(`Completing account: ${userId}`);

        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new NotFoundException("کاربر یافت نشد");
        }

        if (!user.isGuest) {
            throw new BadRequestException("این حساب کاربری قبلاً تکمیل شده است");
        }

        if (await this.userRepository.isPhoneNumberTaken(phoneNumber)) {
            throw new ConflictException("این شماره موبایل قبلاً ثبت شده است");
        }

        const hashedPassword = await this.passwordService.hash(password);

        try {
            const updatedUser = await this.prismaService.$transaction(async (tx) => {
                return tx.user.update({
                    where: { id: userId },
                    data: {
                        phoneNumber,
                        password: hashedPassword,
                        shebaNumber: shebaNumber,
                        email: email,
                        fullName: fullName,
                        isGuest: false
                    }
                });
            });

            this.logger.log(`Account completed: ${userId} (${updatedUser.username})`);

            return CompleteAccountResponseDto.toDto(updatedUser);
        } catch (error: unknown) {
            this.logger.error(`Account completion failed for ${userId}:`, error);
            throw new InternalServerErrorException("خطا در تکمیل حساب کاربری. لطفاً دوباره تلاش کنید");
        }
    }
}
