import { type ReactNode, type ElementType } from "react";

interface IntelCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  style?: React.CSSProperties;
}

export default function IntelCard({ children, className = "", as: Tag = "div", style }: IntelCardProps) {
  const intelStyles: React.CSSProperties = {
    border: "1px solid rgba(168,85,247,0.08)",
    transition: "all 300ms ease",
    ...style,
  };

  return (
    <Tag
      className={className}
      style={intelStyles}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.style.borderColor = "rgba(168,85,247,0.12)";
        e.currentTarget.style.boxShadow = "0 0 8px rgba(168,85,247,0.04)";
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.style.borderColor = "rgba(168,85,247,0.08)";
        e.currentTarget.style.boxShadow = style?.boxShadow ?? "";
      }}
    >
      {children}
    </Tag>
  );
}
