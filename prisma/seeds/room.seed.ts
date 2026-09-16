import { PrismaClient } from "../../generated/prisma/client.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawCard {
    numbers: number[];
    layout: { rows: number[]; cols: number[] };
}

export default async function seedCards(prisma: PrismaClient): Promise<void> {
    // Idempotency — if cards already exist, skip
    const existing = await prisma.card.count();
    if (existing > 0) {
        console.log(`ℹ️  ${existing} cards already exist. Skipping card seeding.`);
        return;
    }

    const filePath = path.join(__dirname, "cards.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(raw) as RawCard[];

    await prisma.card.createMany({
        data: cards.map((c) => ({
            numbers: c.numbers,
            layout: c.layout,
            isActive: true
        })),
        skipDuplicates: true
    });

    console.log(`✅ Seeded ${cards.length} cards.`);
}
