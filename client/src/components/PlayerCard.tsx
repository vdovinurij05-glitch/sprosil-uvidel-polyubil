import React from 'react';
import { Player } from '../types';
import { Avatar } from './Avatar';

interface PlayerCardProps {
  player: Player;
  selected?: boolean;
  onSelect?: () => void;
  showArrow?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ player, selected, onSelect, showArrow }) => {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 8,
        borderRadius: 12,
        cursor: onSelect ? 'pointer' : 'default',
        backgroundColor: selected ? 'rgba(255, 107, 107, 0.15)' : 'transparent',
        border: selected ? '2px solid #FF6B6B' : '2px solid transparent',
        transition: 'all 0.2s',
        position: 'relative',
      }}
    >
      <Avatar photoUrl={player.photoUrl} firstName={player.firstName} size={52} />
      <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center' }}>
        {player.firstName}
      </span>
      {showArrow && selected && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#FF6B6B',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          ♥
        </div>
      )}
    </div>
  );
};
