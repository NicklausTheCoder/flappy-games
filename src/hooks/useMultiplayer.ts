import { useEffect, useRef, useState } from 'react';
import { ref, onValue, push, update, remove, off } from 'firebase/database';
import { db } from '../firebase/init';
import { GameRoom, Player } from '../types/game.types';

export const useMultiplayer = (roomId: string, playerName: string) => {
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [room, setRoom] = useState<GameRoom | null>(null);
  const playerIdRef = useRef<string>(`player_${Date.now()}_${Math.random()}`);
  
  useEffect(() => {
    if (!roomId || !playerName) return;
    
    const roomRef = ref(db, `rooms/${roomId}`);
    const playersRef = ref(db, `rooms/${roomId}/players`);
    
    // Listen for room changes
    const unsubscribeRoom = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoom(data);
        setPlayers(data.players || {});
      } else {
        // Create room if it doesn't exist
        const newRoom: GameRoom = {
          id: roomId,
          players: {},
          status: 'waiting'
        };
        update(roomRef, newRoom);
      }
    });
    
    // Join the room
    const joinRoom = async () => {
      const playerData: Player = {
        id: playerIdRef.current,
        name: playerName,
        position: { x: 100, y: 300 },
        score: 0,
        flappyAlive: true
      };
      
      await update(ref(db), {
        [`rooms/${roomId}/players/${playerIdRef.current}`]: playerData
      });
    };
    
    joinRoom();
    
    // Listen for player movement
    const handlePlayerMove = ((event: CustomEvent) => {
      const { playerId, x, y, velocity, rotation } = event.detail;
      
      // Only update position in Firebase for current player
      if (playerId === playerIdRef.current) {
        const playerRef = ref(db, `rooms/${roomId}/players/${playerId}/position`);
        update(playerRef, { x, y, velocity, rotation });
      }
    }) as EventListener;
    
    window.addEventListener('player-move', handlePlayerMove);
    
    // Cleanup
    return () => {
      unsubscribeRoom();
      window.removeEventListener('player-move', handlePlayerMove);
      
      // Remove player when leaving
      const playerRef = ref(db, `rooms/${roomId}/players/${playerIdRef.current}`);
      remove(playerRef);
    };
  }, [roomId, playerName]);
  
  return { players, room, playerId: playerIdRef.current };
};