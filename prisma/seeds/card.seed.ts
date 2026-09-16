// scripts/insert-cards.ts
import "dotenv/config";
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    const raw = fs.readFileSync("cards.json", "utf-8");
    const cards = JSON.parse(raw) as {
        numbers: number[];
        layout: { rows: number[]; cols: number[] };
    }[];

    console.log(`Inserting ${cards.length} cards...`);

    await prisma.card.createMany({
        data: cards.map((c) => ({
            numbers: c.numbers,
            layout: c.layout,
            isActive: true
        }))
    });

    console.log("🎉 Done.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
