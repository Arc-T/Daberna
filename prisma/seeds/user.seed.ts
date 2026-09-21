// prisma/seeds/user.seed.ts
import { PrismaClient } from "../../generated/prisma/client.js";
import * as bcrypt from "bcrypt";

export default async function seedUsers(prisma: PrismaClient): Promise<void> {
    // Idempotency — if users already exist, skip
    const existing = await prisma.user.count();
    if (existing > 0) {
        console.log(`ℹ️  ${existing} users already exist. Skipping user seeding.`);
        return;
    }

    const passwordHash = await bcrypt.hash("1234", 10);

    const users = [
        {
            username: "taha",
            inviteCode: "100001",
            password: passwordHash,
            fullName: "کاربر تست یک",
            phoneNumber: "09120000001",
            isGuest: false,
            isNewPlayer: false,
            completedGames: 10,
            credit: 1_000_000,
            withdrawableBalance: 500_000,
            referralRewardUsed: false
        },
        {
            username: "aria",
            inviteCode: "100002",
            password: passwordHash,
            fullName: "کاربر تست دو",
            phoneNumber: "09120000002",
            isGuest: false,
            isNewPlayer: false,
            completedGames: 5,
            credit: 500_000,
            withdrawableBalance: 250_000,
            referralRewardUsed: false
        },
        {
            username: "reza",
            inviteCode: "100003",
            password: null,
            fullName: null,
            phoneNumber: null,
            isGuest: true,
            isNewPlayer: true,
            completedGames: 0,
            credit: 50_000,
            withdrawableBalance: 0,
            referralRewardUsed: false
        }
    ];

    await prisma.user.createMany({
        data: users,
        skipDuplicates: true
    });

    console.log(`✅ Seeded ${users.length} users.`);
}
