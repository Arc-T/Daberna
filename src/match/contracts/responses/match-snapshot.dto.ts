export interface MatchCardSnapshot {
    cardId: string;
    numbers: number[];
    layout: { rows: number[]; cols: number[] };
    markedNumbers: number[]; // numbers from `called` that appear on this card
}

export interface MatchPlayerSnapshot {
    playerMatchId: string;
    userId: string | null;
    username: string;
    isBot: boolean;
    cardCount: number;
    lineWinner: boolean;
    fullHouseWinner: boolean;
    result: string;
    prizeAmount: number;
    cards?: MatchCardSnapshot[]; // 👈 only sent for the requesting player
}

export interface MatchSnapshotDto {
    matchId: string;
    roomId: string;
    status: string;
    totalCards: number;
    calledNumbers: number[]; // 👈 only last 5 (docs page 16)
    calledCount: number; // total called, for UI progress
    startTime: Date | null;
    players: MatchPlayerSnapshot[];
}
