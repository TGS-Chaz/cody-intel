import { type ReactNode, useId } from "react";

interface CodyGlowProps {
  active?: boolean; // always renders in Intel — prop accepted for API compatibility
  intensity?: "subtle" | "medium" | "bright";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const OUTER_OPACITY = { subtle: 0.4, medium: 0.6, bright: 0.8 } as const;
const INNER_OPACITY = { subtle: 0.3, medium: 0.5, bright: 0.65 } as const;

const SIZE_CFG = {
  sm: { outerInset: "-20%", innerInset: "-6%", outerBlur: 10, innerBlur: 4 },
  md: { outerInset: "-30%", innerInset: "-10%", outerBlur: 15, innerBlur: 6 },
  lg: { outerInset: "-40%", innerInset: "-15%", outerBlur: 20, innerBlur: 8 },
} as const;

const GRADIENT = "linear-gradient(90deg, #00D4AA, #A855F7, #7C3AED, #00D4AA)";

export default function CodyGlow({ intensity = "medium", size = "md", children }: CodyGlowProps) {
  // `active` prop accepted but ignored — glow is always active in the Intel app
  const uid = useId().replace(/:/g, "");

  const { outerInset, innerInset, outerBlur, innerBlur } = SIZE_CFG[size];
  const outerOp = OUTER_OPACITY[intensity];
  const innerOp = INNER_OPACITY[intensity];
  const cls = `cg-${uid}`;

  return (
    <>
      <style>{`
        @keyframes cg-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .${cls} {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .${cls}::before,
        .${cls}::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          background: ${GRADIENT};
          background-size: 200% 200%;
          animation: cg-shift 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .${cls}::before {
          inset: ${outerInset};
          filter: blur(${outerBlur}px) brightness(0.8);
          opacity: ${outerOp};
        }
        .${cls}::after {
          inset: ${innerInset};
          filter: blur(${innerBlur}px) brightness(1.3);
          opacity: ${innerOp};
        }
      `}</style>
      <span className={cls}>
        <span style={{ position: "relative", zIndex: 1, display: "inline-flex", filter: "brightness(1.05)" }}>
          {children}
        </span>
      </span>
    </>
  );
}
