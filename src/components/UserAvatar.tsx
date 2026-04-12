interface UserAvatarProps {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function UserAvatar({ avatarUrl, initials, size = 36, className = "", animated = true }: UserAvatarProps) {
  const fontSize = size < 28 ? 10 : size < 44 ? 12 : size < 72 ? 16 : 24;
  const hoverClass = animated ? "avatar-hover" : "";

  if (avatarUrl) {
    return (
      <div
        style={{ width: size, height: size, minWidth: size }}
        className={`rounded-full overflow-hidden shrink-0 ${hoverClass} ${className}`}
      >
        <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize,
        background: "linear-gradient(135deg, hsl(168 100% 38%), hsl(168 100% 28%))",
        boxShadow: "0 0 0 2px hsl(168 100% 42% / 0.25)",
      }}
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${hoverClass} ${className}`}
    >
      {initials}
    </div>
  );
}
