import { User } from "../../../../generated/prisma/client.js";

export class SignInResponseDto {
    token: string;
    user: {
        id: string;
        username: string;
        isGuest: boolean;
        isNewPlayer: boolean;
        credit: number;
        inviteCode: string;
    };

    static toDto(user: User, token: string): SignInResponseDto {
        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                isGuest: user.isGuest,
                isNewPlayer: user.isNewPlayer,
                credit: Number(user.credit),
                inviteCode: user.inviteCode
            }
        };
    }
}
