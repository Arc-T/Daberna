import { User } from "../../../../generated/prisma/client.js";

export class RegisterGuestResponseDto {
    id: string;
    username: string;
    inviteCode: string;
    credit: number;
    isGuest: boolean;
    isNewPlayer: boolean;
    createdAt: Date;
    referrerId?: string;
    token: string;

    static toDto(user: User, token: string, referrerId?: string | null): RegisterGuestResponseDto {
        return {
            id: user.id,
            username: user.username,
            inviteCode: user.inviteCode,
            credit: Number(user.credit),
            isGuest: user.isGuest,
            isNewPlayer: user.isNewPlayer,
            createdAt: user.createdAt,
            referrerId: referrerId || undefined,
            token: token
        };
    }
}
