import { IsString, IsNotEmpty } from "class-validator";

export class UnwatchMatchDto {
    @IsString({ message: "شناسه مچ باید متن باشد" })
    @IsNotEmpty({ message: "شناسه مچ الزامی است" })
    matchId: string;
}
