export interface LobbyPlayer {
    id: string;
    name: string;
    cardCount: number;
}

export interface LobbyState {
    roomId: string;
    players: LobbyPlayer[];
    totalCards: number;
    status: "WAITING" | "STARTING" | "STARTED";
    createdAt: string;
}

export interface LobbyResponseDto {
    roomId: string;
    totalCards: number;
    playerCount: number;
    waitingTime: string;
    minCards: number;
    maxCards: number;
    status: "WAITING" | "STARTING" | "STARTED";
}
