import { User } from "../../../../generated/prisma/client.js";

export class CompleteAccountResponseDto {
    id: string;
    username: string;
    inviteCode: string;
    phoneNumber: string;
    credit: number;
    isGuest: boolean;
    isNewPlayer: boolean;
    completedGames: number;
    createdAt: Date;
    updatedAt: Date;

    static toDto(user: User): CompleteAccountResponseDto {
        return {
            id: user.id,
            username: user.username,
            inviteCode: user.inviteCode,
            phoneNumber: user.phoneNumber!,
            credit: Number(user.credit),
            isGuest: user.isGuest,
            isNewPlayer: user.isNewPlayer,
            completedGames: user.completedGames,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }
}
