// Market-intel ambient brief at the top of a Store Detail page. Thin
// adapter over cody-shared/AmbientBriefPanel. Hidden entirely if the
// store has no menu coverage yet (no dispensary_menus rows).

import { AmbientBriefPanel, type AmbientBriefResponse } from "cody-shared";
import { supabase } from "@/lib/supabase";
import { callEdgeFunction } from "@/lib/edge-function";
import codyIcon from "@/assets/cody-icon.svg";

interface StoreBriefPanelProps {
  storeId: string;
  skipIfEmpty?: boolean;
}

interface RawBriefResponse {
  brief?: string;
  generated_at?: string;
  cached?: boolean;
}

export default function StoreBriefPanel({ storeId, skipIfEmpty = true }: StoreBriefPanelProps) {
  const fetchBrief = async (forceRefresh: boolean): Promise<AmbientBriefResponse | null> => {
    const data = await callEdgeFunction<RawBriefResponse>(
      "generate-store-brief",
      { store_id: storeId, force_refresh: forceRefresh },
      45_000,
    );
    const brief = (data?.brief ?? "").trim();
    if (!brief) return null;
    return { brief, cached: data.cached, generated_at: data.generated_at };
  };

  const shouldRender = async (): Promise<boolean> => {
    if (!skipIfEmpty) return true;
    // Render only when we have at least one menu source for the store.
    const { count } = await supabase
      .from("dispensary_menus")
      .select("id", { count: "exact", head: true })
      .eq("intel_store_id", storeId);
    return (count ?? 0) > 0;
  };

  return (
    <AmbientBriefPanel
      entityKey={storeId}
      fetchBrief={fetchBrief}
      shouldRender={shouldRender}
      iconSrc={codyIcon}
      variant="standard"
      subtitle="Cody · Store Intel"
    />
  );
}
