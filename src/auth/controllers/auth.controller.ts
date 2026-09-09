import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "../services/auth.service.js";
import { SkipAuth } from "../../common/decorators/skipt-auth.decorator.js";
import { User } from "../../common/decorators/user.decorator.js";
import type { JwtPayload } from "../../common/types/jwt-payload.js";
import { CompleteAccountDto } from "../contracts/request/complete-account.dto.js";
import { RegisterGuestDto } from "../contracts/request/register-guest.dto.js";
import { SignInDto } from "../contracts/request/sign-in.dto.js";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @SkipAuth()
    @Post("sign-in")
    @HttpCode(HttpStatus.OK)
    async signIn(@Body() signInDto: SignInDto) {
        return this.authService.signIn(signInDto);
    }

    @SkipAuth()
    @Post("register-guest")
    @HttpCode(HttpStatus.CREATED)
    async registerGuest(@Body() registerGuestDto: RegisterGuestDto) {
        return this.authService.registerGuest(registerGuestDto);
    }

    @Post("complete-account")
    @HttpCode(HttpStatus.OK)
    async completeAccount(@User() user: JwtPayload, @Body() completeAccountDto: CompleteAccountDto) {
        return this.authService.completeAccount(user.sub, completeAccountDto);
    }
}
