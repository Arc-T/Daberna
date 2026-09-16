import { io, Socket } from "socket.io-client";
import * as readline from "node:readline";

// ─── Config ────────────────────────────────────────────────────────────────
const URL = "http://localhost:3000";
const NAMESPACE = "/lobby";
const DEFAULT_ROOM_ID = "cmtvc1z8v0000iwvcl4a11gf4";
const DEFAULT_USER = {
    userId: "user-test-1",
    name: "Test User",
    roomId: DEFAULT_ROOM_ID,
    cardCount: 2
};

// ─── Connect ───────────────────────────────────────────────────────────────
const socket: Socket = io(`${URL}${NAMESPACE}`, {
    transports: ["websocket"],
    reconnection: true
});

// ─── Print every server payload verbatim ───────────────────────────────────
const SERVER_EVENTS = ["rooms-status", "lobby-update", "joined-lobby", "match-started", "exception"] as const;

for (const event of SERVER_EVENTS) {
    socket.on(event, (payload) => {
        console.log(`\n📦 ${event}:`);
        console.dir(payload, { depth: null, colors: true });
        rl.prompt(true);
    });
}

socket.on("connect", () => {
    console.log(`✅ connected  id=${socket.id}`);
    rl.prompt(true);
});

socket.on("disconnect", (reason) => {
    console.log(`❌ disconnected: ${reason}`);
});

socket.on("connect_error", (err) => {
    console.error("⚠️  connect_error:", err.message);
});

// ─── CLI ───────────────────────────────────────────────────────────────────
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "lobby> "
});

function printHelp() {
    console.log(`
Commands:
  watch [roomId]                 → watch-lobby    (subscribe to a room's updates)
  unwatch [roomId]               → unwatch-lobby  (unsubscribe)
  join [userId] [name] [roomId] [cardCount]
                                 → join-lobby     (become a player)
  leave [userId] [roomId]        → leave-lobby    (leave the lobby)
  match [roomId]                 → (server event) match-started
  help                           → show this
  quit | exit                    → disconnect and exit

Defaults:
  roomId    = ${DEFAULT_ROOM_ID}
  userId    = ${DEFAULT_USER.userId}
  name      = ${DEFAULT_USER.name}
  cardCount = ${DEFAULT_USER.cardCount}
`);
}

rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return rl.prompt();

    const [cmd, ...args] = trimmed.split(/\s+/);

    try {
        switch (cmd) {
            // ─── Watch (passive) ───────────────────────────────────────
            case "watch":
                await emitWithAck("watch-lobby", {
                    roomId: args[0] ?? DEFAULT_ROOM_ID
                });
                break;

            case "unwatch":
                await emitWithAck("unwatch-lobby", {
                    roomId: args[0] ?? DEFAULT_ROOM_ID
                });
                break;

            // ─── Join / Leave (active) ─────────────────────────────────
            case "join":
                await emitWithAck("join-lobby", {
                    userId: args[0] ?? DEFAULT_USER.userId,
                    name: args[1] ?? DEFAULT_USER.name,
                    roomId: args[2] ?? DEFAULT_USER.roomId,
                    cardCount: args[3] ? Number(args[3]) : DEFAULT_USER.cardCount
                });
                break;

            case "leave":
                await emitWithAck("leave-lobby", {
                    userId: args[0] ?? DEFAULT_USER.userId,
                    roomId: args[1] ?? DEFAULT_USER.roomId
                });
                break;

            // ─── Misc ──────────────────────────────────────────────────
            case "help":
                printHelp();
                break;

            case "quit":
            case "exit":
                return shutdown();

            default:
                console.log(`❓ unknown command: "${cmd}"  (type "help")`);
        }
    } catch (err: any) {
        console.error("⚠️ ", err.message);
    }

    rl.prompt(true);
});

// ─── Helper: emit and await the ack ────────────────────────────────────────
function emitWithAck<T = any>(event: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ack of "${event}"`)), 5000);
        socket.emit(event, data, (response: T) => {
            clearTimeout(timer);
            console.log(`\n📦 ${event} (ack):`);
            console.dir(response, { depth: null, colors: true });
            resolve(response);
        });
    });
}

// ─── Clean exit ────────────────────────────────────────────────────────────
function shutdown() {
    console.log("\n👋 closing");
    rl.close();
    socket.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
