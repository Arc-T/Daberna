// src/lobby/contracts/requests/join-lobby.dto.ts
import { IsString, IsNotEmpty, IsInt, Min, Max } from "class-validator";
import { MIN_ROOM_CARDS, MAX_ROOM_CARDS } from "../../../room/contracts/constants/room.constant.js";

export class JoinLobbyDto {
    @IsString({ message: "شناسه کاربر باید متن باشد" })
    @IsNotEmpty({ message: "شناسه کاربر الزامی است" })
    userId: string;

    @IsString({ message: "نام باید متن باشد" })
    @IsNotEmpty({ message: "نام الزامی است" })
    name: string;

    @IsString({ message: "شناسه روم باید متن باشد" })
    @IsNotEmpty({ message: "شناسه روم الزامی است" })
    roomId: string;

    @IsInt({ message: "تعداد کارت باید عدد باشد" })
    @Min(MIN_ROOM_CARDS, { message: `حداقل تعداد کارت ${MIN_ROOM_CARDS} است` })
    @Max(MAX_ROOM_CARDS, { message: `حداکثر تعداد کارت ${MAX_ROOM_CARDS} است` })
    cardCount: number;
}
