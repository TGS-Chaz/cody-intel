import { createContext, useContext, type ReactNode } from "react";

interface IntelTheme {
  isIntelTier: boolean;
}

// Intel app is always intel tier — no plan check needed
const IntelThemeContext = createContext<IntelTheme>({ isIntelTier: true });

export function useIntelTheme() {
  return useContext(IntelThemeContext);
}

export default function IntelThemeProvider({ children }: { children: ReactNode }) {
  return (
    <IntelThemeContext.Provider value={{ isIntelTier: true }}>
      <div
        className="intel-tier-active"
        style={{
          "--intel-glow": "rgba(168, 85, 247, 0.08)",
          "--intel-glow-strong": "rgba(168, 85, 247, 0.15)",
          "--intel-accent": "#A855F7",
          "--intel-accent-secondary": "#7C3AED",
          "--intel-gradient": "linear-gradient(135deg, #A855F7, #7C3AED)",
          "--intel-border": "rgba(168, 85, 247, 0.1)",
          "--intel-border-hover": "rgba(168, 85, 247, 0.2)",
        } as React.CSSProperties}
      >
        {children}
      </div>
    </IntelThemeContext.Provider>
  );
}
