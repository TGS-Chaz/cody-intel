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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] px-4">
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
      {/* Teal glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.06] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #00D4AA 0%, transparent 70%)", filter: "blur(100px)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="relative shrink-0 flex items-center justify-center w-9 h-9">
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, hsl(168 100% 42% / 0.4) 0%, transparent 70%)",
                filter: "blur(8px)",
                transform: "scale(1.5)",
              }}
            />
            <img src={codyIcon} alt="" className="relative h-7 w-auto" />
          </div>
          <div className="flex items-baseline leading-none" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#00D4AA" }}>Cody</span>
            <span
              className="ml-1.5 text-[11px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm self-center"
              style={{ background: "hsl(168 100% 42% / 0.12)", color: "hsl(168 100% 42%)" }}
            >
              Intel
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6 bg-white border border-gray-200 shadow-xl shadow-gray-200/50">
          <h1 className="text-[17px] font-semibold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-[13px] text-gray-500 mb-6">Cannabis Market Intelligence Platform</p>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                className="w-full h-10 px-3 rounded-md bg-gray-50 border border-gray-200 text-gray-900 text-[14px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full h-10 px-3 pr-10 rounded-md bg-gray-50 border border-gray-200 text-gray-900 text-[14px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[12px] rounded-md px-3 py-2 bg-red-50 text-red-600 border border-red-100"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-md font-medium text-[14px] text-white transition-colors disabled:opacity-60"
              style={{ background: submitting ? "#005643" : "#006B55" }}
              onMouseEnter={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.background = "#005643"; }}
              onMouseLeave={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.background = "#006B55"; }}
            >
              {submitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-gray-400 mt-6">
          Same account as Cody CRM — use your existing credentials.
        </p>
      </motion.div>
    </div>
  );
}
