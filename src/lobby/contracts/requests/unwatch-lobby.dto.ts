// src/lobby/contracts/requests/unwatch-lobby.dto.ts
import { IsString, IsNotEmpty } from "class-validator";

export class UnwatchLobbyDto {
    @IsString({ message: "شناسه روم باید متن باشد" })
    @IsNotEmpty({ message: "شناسه روم الزامی است" })
    roomId: string;
}
