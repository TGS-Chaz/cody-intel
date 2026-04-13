import { lazy, Suspense } from "react";
import { Map } from "lucide-react";
import { PlanGate } from "@/components/PlanGate";

const TerritoryMap = lazy(() =>
  import("@/components/maps/TerritoryMap").then((m) => ({ default: m.TerritoryMap }))
);

export function Territory() {
  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <Map className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Territory Manager</h1>
          <p className="text-xs text-muted-foreground">
            Draw sales territories, assign reps, and track store coverage
          </p>
        </div>
      </div>

      <PlanGate feature="territory_planning">
        <Suspense fallback={
          <div className="h-[560px] rounded-xl border border-border bg-card/50 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        }>
          <TerritoryMap />
        </Suspense>
      </PlanGate>
    </div>
  );
}
