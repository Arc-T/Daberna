import { IsString, IsNotEmpty } from "class-validator";

export class WatchLobbyDto {
    @IsString({ message: "شناسه روم باید متن باشد" })
    @IsNotEmpty({ message: "شناسه روم الزامی است" })
    roomId: string;
}
