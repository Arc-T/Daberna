import { IsNotEmpty } from "class-validator";

export class SignInDto {
    @IsNotEmpty({ message: "نام کاربری الزامی است." })
    username: string;

    @IsNotEmpty({ message: "رمز عبور الزامی است." })
    password: string;
}
