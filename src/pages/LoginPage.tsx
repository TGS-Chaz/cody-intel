import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import codyIcon from "@/assets/cody-icon.svg";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
      {/* Teal glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.06] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(var(--primary)) 0%, transparent 70%)", filter: "blur(100px)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-1.5 mb-10">
          <img src={codyIcon} alt="" className="h-8 w-auto" />
          <span className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "hsl(var(--primary))" }}>c</span><span className="text-foreground">ody</span>
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded self-end mb-1"
            style={{ background: "hsl(168 100% 42% / 0.12)", color: "hsl(168 100% 42%)" }}
          >
            intel
          </span>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6 bg-card border border-border shadow-xl shadow-border/50">
          <h1 className="text-[17px] font-semibold text-foreground mb-1">Welcome back</h1>
          <p className="text-[13px] text-muted-foreground mb-6">Cannabis Market Intelligence Platform</p>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                className="w-full h-10 px-3 rounded-md bg-background border border-border text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full h-10 px-3 pr-10 rounded-md bg-background border border-border text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[12px] rounded-md px-3 py-2 bg-destructive/10 text-destructive border border-destructive/20"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-md font-medium text-[14px] text-white transition-colors disabled:opacity-60"
              style={{ background: "hsl(var(--primary))", opacity: submitting ? 0.7 : 1 }}
              onMouseEnter={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.opacity = "1"; }}
            >
              {submitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-muted-foreground mt-6">
          Same account as Cody CRM — use your existing credentials.
        </p>
      </motion.div>
    </div>
  );
}
