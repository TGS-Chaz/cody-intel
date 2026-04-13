import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sparkles, Database, Tag } from "lucide-react";

interface Stats {
  total_items:       number;
  weight_normalized: number;
  name_normalized:   number;
  category_inferred: number;
  brand_aliases:     number;
}

export function NormalizationStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("normalization_stats").then(({ data }) => {
      if (data && data[0]) setStats(data[0] as Stats);
      setLoading(false);
    });
  }, []);

  if (loading || !stats) {
    return (
      <div className="rounded-xl border border-border bg-card/50 h-20 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const weightPct = stats.total_items > 0 ? Math.round((stats.weight_normalized / stats.total_items) * 100) : 0;
  const namePct   = stats.total_items > 0 ? Math.round((stats.name_normalized   / stats.total_items) * 100) : 0;
  const catPct    = stats.total_items > 0 ? Math.round((stats.category_inferred / stats.total_items) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Catalog Mastering
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {stats.total_items.toLocaleString()} items normalized
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Stat icon={Database} label="Weights"   value={stats.weight_normalized} pct={weightPct} color="#10B981" />
        <Stat icon={Tag}      label="Names"     value={stats.name_normalized}   pct={namePct}   color="hsl(168 100% 42%)" />
        <Stat icon={Tag}      label="Categories" value={stats.category_inferred} pct={catPct}    color="#A78BFA" />
        <Stat icon={Sparkles} label="Brand Aliases" value={stats.brand_aliases}  pct={null}      color="#F59E0B" />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, pct, color,
}: {
  icon: any;
  label: string;
  value: number;
  pct: number | null;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums" style={{ color }}>
          {value.toLocaleString()}
          {pct != null && <span className="text-[10px] text-muted-foreground font-normal ml-1">({pct}%)</span>}
        </p>
      </div>
    </div>
  );
}
