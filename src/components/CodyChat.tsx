import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2 } from "lucide-react";
import { callEdgeFunction } from "@/lib/edge-function";
import codyIcon from "@/assets/cody-icon.svg";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

async function askCodyMarket(
  message: string,
  history: { role: string; content: string }[]
): Promise<string> {
  try {
    const data = await callEdgeFunction<{ reply: string }>(
      "cody-market-ai",
      { message, history },
      45_000,
    );
    return data.reply;
  } catch (err: any) {
    return err.message ?? "Couldn't reach the server. Try again.";
  }
}

export default function CodyChat({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "Hey! I'm Cody, your cannabis market intelligence analyst. Ask me about brand rankings, category trends, pricing, city market data, or which stores carry specific brands.", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [waking, setWaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);
    setWaking(false);
    wakingTimer.current = setTimeout(() => setWaking(true), 4000);

    const history = messages
      .filter((m) => m.id !== "welcome")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const reply = await askCodyMarket(text, history);

    if (wakingTimer.current) clearTimeout(wakingTimer.current);
    setWaking(false);

    const botMsg: Message = { id: `b-${Date.now()}`, role: "assistant", content: reply, ts: Date.now() };
    setMessages((prev) => [...prev, botMsg]);
    setThinking(false);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden flex flex-col"
          style={{
            right: 24,
            bottom: 16,
            height: "min(540px, calc(100vh - 4rem))",
            background: "hsl(var(--card))",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 24px 80px var(--shadow-heavy), 0 0 0 1px var(--glass-border-subtle)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.1), transparent)",
              borderBottom: "1px solid var(--glass-border-subtle)",
            }}
          >
            <img src={codyIcon} alt="" className="w-6 h-6" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-foreground leading-none">Cody Market AI</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cannabis Market Intelligence</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${msg.role === "user" ? "bg-primary text-primary-foreground" : ""}`}
                  style={msg.role === "assistant" ? {
                    background: "var(--glass-bg)",
                    border: "1px solid var(--glass-border-subtle)",
                  } : {}}
                >
                  <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2"
                  style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border-subtle)" }}>
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  {waking && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">Analyzing market data...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Suggested prompts (only before first user message) */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {[
                "Top 10 brands by store count",
                "Category share breakdown",
                "Average prices by category",
                "Which stores carry Desert Valley?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-primary/50 hover:text-primary text-muted-foreground transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            className="shrink-0 px-3 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid var(--glass-border-subtle)" }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about brands, prices, market trends..."
              className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none"
              disabled={thinking}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || thinking}
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: "hsl(168 100% 42%)" }}
            >
              {thinking
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
