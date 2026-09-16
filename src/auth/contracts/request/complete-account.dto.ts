import { IsEmail, IsNotEmpty, IsString, Length, Matches, IsOptional } from "class-validator";

export class CompleteAccountDto {
    @IsString({ message: "شماره موبایل باید متن باشد" })
    @IsNotEmpty({ message: "شماره موبایل الزامی است" })
    @Matches(/^[0-9]+$/, { message: "شماره موبایل فقط می‌تواند شامل اعداد باشد" })
    @Length(11, 11, { message: "شماره موبایل باید ۱۱ رقم باشد" })
    phoneNumber: string;

    @IsString({ message: "رمز عبور باید متن باشد" })
    @IsNotEmpty({ message: "رمز عبور الزامی است" })
    @Length(8, 20, { message: "رمز عبور باید حداقل ۸ کاراکتر باشد" })
    password: string;

    @IsEmail({}, { message: "ایمیل معتبر نیست" })
    @IsString({ message: "ایمیل باید متن باشد" })
    email: string;

    @IsString({ message: "نام کامل باید متن باشد" })
    @Length(3, 50, { message: "نام کامل باید بین ۳ تا ۵۰ کاراکتر باشد" })
    fullName: string;

    @IsString({ message: "شماره شبا باید متن باشد" })
    @Matches(/^IR[0-9]{24}$/, { message: "شماره شبا معتبر نیست" })
    shebaNumber: string;
}
