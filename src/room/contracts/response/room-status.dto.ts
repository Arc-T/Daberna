export class RoomStatusDto {
  id: string;
  name: string;
  entryFee: number;
  minCards: number;
  maxCards: number;
  filledCards: number;
  remainingTime: number;
  status: 'WAITING' | 'STARTING' | 'STARTED' | 'FULL';
}