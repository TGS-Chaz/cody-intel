import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Sparkles, BarChart2, Target, Package, Zap } from "lucide-react";
import { callEdgeFunction } from "@/lib/edge-function";
import codyIcon from "@/assets/cody-icon.svg";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

const SUGGESTED = [
  {
    category: "Market Intelligence",
    icon: BarChart2,
    color: "hsl(217 91% 60%)",
    prompts: [
      "What brands are trending statewide right now?",
      "Give me a competitive briefing for the Yakima market",
      "Which categories are growing fastest in Seattle?",
      "What's the average price trend for flower this month?",
    ],
  },
  {
    category: "Distribution Gaps",
    icon: Target,
    color: "#F59E0B",
    prompts: [
      "Which stores carry Phat Panda but not our brands?",
      "Where are the biggest distribution gaps for Desert Valley?",
      "Which stores in Spokane should we target for expansion?",
      "Find stores carrying competitors but not Painted Rooster",
    ],
  },
  {
    category: "Purchase Orders",
    icon: Package,
    color: "#10B981",
    prompts: [
      "Suggest a restock order for Fire Cannabis in Yakima",
      "What should we pitch to a store in Seattle?",
      "Which of our products are most likely stocked out right now?",
      "What's selling best across our brand portfolio?",
    ],
  },
  {
    category: "Competitive Intel",
    icon: Zap,
    color: "#A855F7",
    prompts: [
      "How is Phat Panda performing vs our brands?",
      "Which competitor dropped prices recently?",
      "What new brands are entering the Spokane market?",
      "Where are we losing shelf space to competitors?",
    ],
  },
];

async function askCody(
  message: string,
  history: { role: string; content: string }[]
): Promise<string> {
  try {
    const data = await callEdgeFunction<{ reply: string }>(
      "cody-market-ai",
      { message, history },
      45_000
    );
    return data.reply;
  } catch (err: any) {
    return err.message ?? "Couldn't reach the server. Try again.";
  }
}

const WELCOME =
  "Hey! I'm Cody — your cannabis market intelligence analyst for Washington State.\n\nI have access to menu data from 400+ dispensaries including brands, categories, pricing, and geographic coverage. Ask me anything about the market.";

export function AskCody() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: WELCOME, ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [waking, setWaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || thinking) return;
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: msg, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);
    setWaking(false);
    wakingTimer.current = setTimeout(() => setWaking(true), 4000);

    const history = messages
      .filter((m) => m.id !== "welcome")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const reply = await askCody(msg, history);

    if (wakingTimer.current) clearTimeout(wakingTimer.current);
    setWaking(false);

    setMessages((prev) => [
      ...prev,
      { id: `b-${Date.now()}`, role: "assistant", content: reply, ts: Date.now() },
    ]);
    setThinking(false);
  }

  const showSuggested = messages.length === 1;

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100dvh - 2.75rem)" }}
    >
      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="px-6 py-4 shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.06), transparent)",
            borderBottom: "1px solid var(--glass-border-subtle)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(168,85,247,0.15)",
                border: "1px solid rgba(168,85,247,0.3)",
              }}
            >
              <img
                src={codyIcon}
                alt=""
                className="w-5 h-5"
                style={{ filter: "hue-rotate(220deg) saturate(1.5)" }}
              />
            </div>
            <div>
              <h1 className="text-foreground leading-none">Ask Cody</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cannabis market intelligence · Washington State
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mr-2.5 mt-0.5"
                    style={{
                      background: "rgba(168,85,247,0.15)",
                      border: "1px solid rgba(168,85,247,0.25)",
                    }}
                  >
                    <img
                      src={codyIcon}
                      alt=""
                      className="w-4 h-4"
                      style={{ filter: "hue-rotate(220deg) saturate(1.5)" }}
                    />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : ""
                  }`}
                  style={
                    msg.role === "assistant"
                      ? {
                          background: "var(--glass-bg, hsl(var(--card)))",
                          border: "1px solid var(--glass-border-subtle)",
                        }
                      : {}
                  }
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </motion.div>
            ))}

            {thinking && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mr-2.5 mt-0.5"
                  style={{
                    background: "rgba(168,85,247,0.15)",
                    border: "1px solid rgba(168,85,247,0.25)",
                  }}
                >
                  <img
                    src={codyIcon}
                    alt=""
                    className="w-4 h-4"
                    style={{ filter: "hue-rotate(220deg) saturate(1.5)" }}
                  />
                </div>
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: "var(--glass-bg, hsl(var(--card)))",
                    border: "1px solid var(--glass-border-subtle)",
                  }}
                >
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "#A855F7" }}
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  {waking && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Analyzing market data...
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Quick prompts — only before first user message */}
        {showSuggested && (
          <div className="px-6 pb-3 flex flex-wrap gap-1.5 shrink-0">
            {[
              "What brands are trending statewide right now?",
              "Which stores carry Phat Panda but not our brands?",
              "Suggest a restock order for Fire Cannabis in Yakima",
              "Give me a competitive briefing for the Yakima market",
            ].map((p) => (
              <button
                key={p}
                onClick={() => handleSend(p)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-primary/50 hover:text-primary text-muted-foreground transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderTop: "1px solid var(--glass-border-subtle)" }}
        >
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid var(--glass-border)",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about brands, prices, market trends, store coverage..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
              disabled={thinking}
              autoFocus
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || thinking}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: "#A855F7" }}
            >
              {thinking ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Suggested prompts sidebar (desktop only) ────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-60 shrink-0 overflow-y-auto p-4 space-y-5"
        style={{ borderLeft: "1px solid var(--glass-border-subtle)" }}
      >
        <div className="flex items-center gap-2 pt-1">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Suggested Questions
          </p>
        </div>

        {SUGGESTED.map((group) => (
          <div key={group.category} className="space-y-1">
            <div className="flex items-center gap-1.5 px-1 pb-0.5">
              <group.icon className="w-3 h-3 shrink-0" style={{ color: group.color }} />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                {group.category}
              </p>
            </div>
            {group.prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                disabled={thinking}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-transparent hover:border-border disabled:opacity-50 leading-snug"
              >
                {prompt}
              </button>
            ))}
          </div>
        ))}
      </aside>
    </div>
  );
}
