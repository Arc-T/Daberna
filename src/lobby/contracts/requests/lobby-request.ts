export interface LobbyPlayer {
    id: string | null;      // null for bots
    name: string;
    cardCount: number;
    paidAmount: number;
    joinedAt: string;
}

export interface LobbyState {
    roomId: string;
    createdAt: string;
    status: "WAITING" | "STARTING" | "STARTED";
    players: LobbyPlayer[];
    totalCards: number;

    // runtime flags
    firstPeriodTimeFired: boolean;
    secondWindowFired: boolean;
    botFillInProgress: boolean;
}

export interface LobbyResponseDto {
    roomId: string;
    totalCards: number;
    playerCount: number;
    waitingTime: number;
    minCards: number;
    maxCards: number;
    status: LobbyState["status"];
    players: { name: string; cardCount: number }[];
}