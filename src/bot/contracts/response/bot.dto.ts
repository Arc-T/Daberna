export interface BotDto {
    username: string;
    cardCount: number;
    stats: {
        games: number;
        lineWins: number;
        fullHouseWins: number;
    };
}