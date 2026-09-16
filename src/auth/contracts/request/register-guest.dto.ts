import { IsOptional, IsString, Length, Matches } from "class-validator";

export class RegisterGuestDto {
    @IsString({ message: "نام کاربری باید متن باشد" })
    @Length(3, 20, { message: "نام کاربری باید بین ۳ تا ۲۰ کاراکتر باشد" })
    @Matches(/^[a-zA-Z0-9\u0600-\u06FF]+$/, {
        message: "نام کاربری فقط می‌تواند شامل حروف فارسی، حروف انگلیسی اعداد باشد"
    })
    username: string;

    @IsOptional()
    @Matches(/^[0-9]+$/, { message: "کد دعوت فقط می‌تواند شامل اعداد باشد" })
    inviteCode?: string;
}
