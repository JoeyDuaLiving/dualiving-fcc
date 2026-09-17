import "server-only";
import { db } from "@/db/client";
import { whatIfAdjustments, whatIfScenarios } from "@/db/schema";

// ---------------------------------------------------------------------------
// "What if" scenario planning - saved, named hypotheticals (e.g. "Hire a
// PM", "5% wage increase") made of one or more recurring monthly cost/
// income adjustments. See what-if-calculations.ts for how these layer onto
// the live cash forecast's own current monthly trend to produce a
// multi-month projection - this file just loads the user's saved inputs.
// ---------------------------------------------------------------------------

export interface WhatIfAdjustmentDTO {
  id: string;
  label: string;
  category: "wages" | "other";
  monthlyAmount: number; // signed - positive = extra cost, negative = saving/extra income
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
}

export interface WhatIfScenarioDTO {
  id: string;
  name: string;
  description: string;
  adjustments: WhatIfAdjustmentDTO[];
}

export interface LoadWhatIfScenariosResult {
  scenarios: WhatIfScenarioDTO[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadWhatIfScenarios(): Promise<LoadWhatIfScenariosResult> {
  try {
    const [scenarioRows, adjustmentRows] = await Promise.all([db.select().from(whatIfScenarios), db.select().from(whatIfAdjustments)]);

    const adjustmentsByScenarioId = new Map<string, WhatIfAdjustmentDTO[]>();
    for (const a of adjustmentRows) {
      const dto: WhatIfAdjustmentDTO = {
        id: a.id,
        label: a.label,
        category: a.category === "wages" ? "wages" : "other",
        monthlyAmount: a.monthlyAmount,
        startDate: a.startDate.toISOString().slice(0, 10),
        endDate: a.endDate ? a.endDate.toISOString().slice(0, 10) : null,
      };
      if (!adjustmentsByScenarioId.has(a.scenarioId)) adjustmentsByScenarioId.set(a.scenarioId, []);
      adjustmentsByScenarioId.get(a.scenarioId)!.push(dto);
    }

    const scenarios: WhatIfScenarioDTO[] = scenarioRows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      adjustments: (adjustmentsByScenarioId.get(s.id) ?? []).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }));

    return { scenarios: scenarios.sort((a, b) => a.name.localeCompare(b.name)), source: "live" };
  } catch (err) {
    return { scenarios: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
