import { PrismaClient } from "../../generated/prisma/client.js";

export default async function seedRooms(prisma: PrismaClient): Promise<void> {
    // Idempotency — if rooms already exist, skip
    const existing = await prisma.room.count();
    if (existing > 0) {
        console.log(`ℹ️  ${existing} rooms already exist. Skipping room seeding.`);
        return;
    }

    const rooms = [
        { name: "IRON", entryFee: 100 },
        { name: "BRONZE", entryFee: 200 },
        { name: "SILVER", entryFee: 300 },
        { name: "GOLD", entryFee: 400 }
    ];

    await prisma.room.createMany({
        data: rooms,
        skipDuplicates: true
    });

    console.log(`✅ Seeded ${rooms.length} rooms.`);
}
