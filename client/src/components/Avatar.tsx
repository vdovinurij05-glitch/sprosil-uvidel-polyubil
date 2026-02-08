import React from 'react';

interface AvatarProps {
  photoUrl: string | null;
  firstName: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ photoUrl, firstName, size = 48 }) => {
  const initials = firstName.charAt(0).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
  const colorIndex = firstName.charCodeAt(0) % colors.length;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={firstName}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: colors[colorIndex],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.4,
        fontWeight: 'bold',
      }}
    >
      {initials}
    </div>
  );
};
