type AvatarProps = {
  src?: string | null;
  name: string;
  size?: number;
};

export function Avatar({ src, name, size = 32 }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-accent text-white flex items-center justify-center font-semibold"
    >
      {initials}
    </div>
  );
}
