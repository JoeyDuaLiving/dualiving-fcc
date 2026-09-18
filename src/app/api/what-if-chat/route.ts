import { callClaude, type ClaudeMessage, type ClaudeToolUseBlock } from "@/integrations/anthropic/client";
import { loadLiveForecastData } from "@/lib/live-forecast";
import { formatAUD, formatAUDSigned, formatMonthAU } from "@/lib/format";
import { settings, TODAY } from "@/lib/mock-data";
import { averageMonthlyRevenue, liveAverageMonthlyOpex, loadLiveFinancialYearSummary, loadLiveTrailingAverageRevenue } from "@/lib/xero-source";
import { loadRecurringLiabilities, monthlyEquivalent } from "@/lib/recurring-liabilities-source";
import { loadWhatIfScenarios, type WhatIfAdjustmentDTO } from "@/lib/what-if-source";
import { firstMonthBelowBuffer, projectMonthlyBalance } from "@/lib/what-if-calculations";

// ---------------------------------------------------------------------------
// Turns a free-text "what if" question into a conversational reply, backed
// by the app's own real numbers rather than the model doing the cash-flow
// arithmetic itself: Claude only (1) decides whether the message describes
// a specific hypothetical change worth testing, and if so extracts it into
// structured fields via the propose_adjustment tool, and (2) writes the
// final reply - the actual multi-month projection always runs through
// what-if-calculations.ts, the same deterministic code the chart uses.
// ---------------------------------------------------------------------------

const PROPOSE_ADJUSTMENT_TOOL = {
  name: "propose_adjustment",
  description:
    "Propose a specific hypothetical recurring monthly cash change to test against the business's forecast - a new hire, a wage increase, a revenue change, cutting or adding a cost. Call this whenever the user describes a concrete change they want tested. Do not call it for general questions about the current numbers or trend - just answer those directly in text.",
  input_schema: {
    type: "object",
    properties: {
      label: { type: "string", description: "Short human label, e.g. 'Hire a Project Manager' or '10% revenue increase'" },
      category: { type: "string", enum: ["wages", "revenue", "other"] },
      monthlyAmount: {
        type: "number",
        description: "Positive dollar amount per month - the size of the change, already computed from any percentage the user gave using the real baseline figures provided",
      },
      effect: { type: "string", enum: ["cost", "saving"], description: "'cost' if this reduces cash (a new expense, a raise), 'saving' if it increases cash (a cost cut, more revenue)" },
      startDate: { type: "string", description: "YYYY-MM-DD the change begins - default to today if the user didn't say" },
      endDate: { type: ["string", "null"], description: "YYYY-MM-DD the change ends, or null if ongoing" },
    },
    required: ["label", "category", "monthlyAmount", "effect", "startDate"],
  },
};

interface ChatRequestBody {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  scenarioId: string | null;
}

interface ProposedAdjustmentInput {
  label: string;
  category: "wages" | "revenue" | "other";
  monthlyAmount: number;
  effect: "cost" | "saving";
  startDate: string;
  endDate?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;
  if (!body.message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const [liveForecast, financialYear, liabilitiesResult, scenariosResult, trailingAverageRevenueResult] = await Promise.all([
    loadLiveForecastData(),
    loadLiveFinancialYearSummary(),
    loadRecurringLiabilities(),
    loadWhatIfScenarios(),
    loadLiveTrailingAverageRevenue(12),
  ]);

  if (liveForecast.source !== "live" || !liveForecast.data) {
    return Response.json({ error: "Live cash forecast isn't available yet." }, { status: 503 });
  }

  const opexLive = liveAverageMonthlyOpex(liveForecast.data.operatingExpenses);
  const todayBalance = liveForecast.data.currentCashBalance;
  const delta = financialYear.trailingCashTrendMonthlyDelta;

  const avgMonthlyRevenue = averageMonthlyRevenue(financialYear);
  const trailing12MonthRevenue = trailingAverageRevenueResult.source === "live" ? trailingAverageRevenueResult.average : null;
  const totalLiabilityMonthly = liabilitiesResult.source === "live" ? liabilitiesResult.liabilities.reduce((s, l) => s + monthlyEquivalent(l), 0) : 0;

  const existingScenario = body.scenarioId ? scenariosResult.scenarios.find((s) => s.id === body.scenarioId) : undefined;
  const existingAdjustments = existingScenario?.adjustments ?? [];

  const contextLines = [
    `Today's date: ${TODAY}.`,
    `Current cash balance: ${formatAUD(todayBalance)}.`,
    `Minimum cash buffer (management assumption): ${formatAUD(settings.minimumCashBuffer)}.`,
    `Current net monthly cash trend (the business's actual trailing-3-month bank cash movement, from Xero's ledger - not a forecast): ${formatAUDSigned(delta)}/month.`,
    `Average monthly revenue (this financial year to date, from Xero's P&L): ${formatAUD(avgMonthlyRevenue)}.`,
    ...(trailing12MonthRevenue !== null ? [`Average monthly revenue (trailing 12 months, a steadier longer-term reference): ${formatAUD(trailing12MonthRevenue)}.`] : []),
    `Average monthly operating expenses (Xero, live): ${formatAUD(opexLive)}.`,
    `Recurring loan/liability repayments not in Xero's P&L: ${formatAUD(totalLiabilityMonthly)}/month.`,
    existingAdjustments.length > 0
      ? `This scenario already has these adjustments: ${existingAdjustments.map((a) => `${a.label} (${formatAUDSigned(-a.monthlyAmount)}/month from ${a.startDate})`).join("; ")}.`
      : "This scenario has no adjustments yet.",
  ];

  const system = [
    "You are the What If assistant inside a construction company's financial command centre, helping management reason about hypothetical changes to their cash position.",
    "Ground everything in the real figures given below - never invent numbers.",
    "If the user describes a specific hypothetical change to test (a hire, a raise, a revenue change, a cost cut), call propose_adjustment with your best structured extraction, computing any percentage against the real baseline figures given.",
    "If the user is just asking a question about the current numbers/trend, answer directly in 2-4 plain sentences using the figures below - do not call the tool.",
    "Keep replies short, concrete and conversational - reference real dollar figures and dates, not vague language.",
    "Plain prose only - no markdown (no **bold**, no bullet points, no headers), since this renders as plain text in a chat bubble.",
    ...contextLines,
  ].join("\n");

  const messages: ClaudeMessage[] = [...body.history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: body.message }];

  const first = await callClaude({ system, messages, tools: [PROPOSE_ADJUSTMENT_TOOL] });
  const toolUse = first.content.find((b): b is ClaudeToolUseBlock => b.type === "tool_use" && b.name === "propose_adjustment");

  if (!toolUse) {
    const text = first.content.find((b) => b.type === "text")?.text ?? "I couldn't work out a response - try rephrasing.";
    return Response.json({ reply: text, proposedAdjustment: null });
  }

  const input = toolUse.input as unknown as ProposedAdjustmentInput;
  const signedAmount = input.effect === "cost" ? Math.abs(input.monthlyAmount) : -Math.abs(input.monthlyAmount);

  const proposedDto: WhatIfAdjustmentDTO = {
    id: "proposed",
    label: input.label,
    category: input.category,
    monthlyAmount: signedAmount,
    startDate: input.startDate || TODAY,
    endDate: input.endDate ?? null,
  };

  const horizon = 12;
  const withoutNew = projectMonthlyBalance(todayBalance, delta, existingAdjustments, horizon, TODAY);
  const withNew = projectMonthlyBalance(todayBalance, delta, [...existingAdjustments, proposedDto], horizon, TODAY);
  const breach = firstMonthBelowBuffer(withNew, settings.minimumCashBuffer);
  const breachWithout = firstMonthBelowBuffer(withoutNew, settings.minimumCashBuffer);

  const computedSummary = {
    horizonMonths: horizon,
    balanceAtHorizonWithoutThisChange: Math.round(withoutNew[withoutNew.length - 1].balance),
    balanceAtHorizonWithThisChange: Math.round(withNew[withNew.length - 1].balance),
    differenceAtHorizon: Math.round(withNew[withNew.length - 1].balance - withoutNew[withoutNew.length - 1].balance),
    dipsBelowBufferWithThisChange: breach ? formatMonthAU(breach.monthKey) : null,
    dippedBelowBufferAlreadyWithoutThisChange: breachWithout ? formatMonthAU(breachWithout.monthKey) : null,
  };

  const followUpMessages: ClaudeMessage[] = [
    ...messages,
    { role: "assistant", content: first.content },
    { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(computedSummary) }] },
  ];

  const second = await callClaude({ system, messages: followUpMessages });
  const text = second.content.find((b) => b.type === "text")?.text ?? "Here's the change - add it to see the full effect.";

  return Response.json({
    reply: text,
    proposedAdjustment: {
      label: input.label,
      category: proposedDto.category,
      monthlyAmount: signedAmount,
      startDate: proposedDto.startDate,
      endDate: proposedDto.endDate,
    },
  });
}
