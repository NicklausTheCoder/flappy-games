export interface Player {
  id: string;
  name: string;
  position: {
    x: number;
    y: number;
  };
  score: number;
  flappyAlive: boolean;
}

export interface GameRoom {
  id: string;
  players: Record<string, Player>;
  status: 'waiting' | 'playing' | 'finished';
}