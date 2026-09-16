import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

import seedRooms from "./seeds/room.seed.js";
import seedCards from "./seeds/room.seed.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Starting database seeding...");

    // Run in dependency order
    await seedRooms(prisma);
    await seedCards(prisma);

    console.log("🎉 All seeds completed successfully.");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
