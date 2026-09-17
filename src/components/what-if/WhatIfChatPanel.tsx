"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { formatAUDSigned, formatDateAU } from "@/lib/format";
import type { WhatIfAdjustmentCategory, WhatIfScenarioDTO } from "@/lib/what-if-source";

interface ProposedAdjustment {
  label: string;
  category: WhatIfAdjustmentCategory;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  proposedAdjustment?: ProposedAdjustment | null;
  added?: boolean;
}

const STARTER_PROMPTS = ["What if we hire a Project Manager for $9,000/month?", "What if revenue increases 10%?", "What's driving the current trend?"];

export function WhatIfChatPanel({ scenarios }: { scenarios: WhatIfScenarioDTO[] }) {
  const router = useRouter();
  const [activeScenarioId, setActiveScenarioId] = useState<string | "new">("new");
  const [newScenarioName, setNewScenarioName] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeScenario = activeScenarioId === "new" ? null : scenarios.find((s) => s.id === activeScenarioId);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/what-if-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, scenarioId: activeScenario?.id ?? null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "The assistant couldn't respond - try again.");
      }
      const data = (await res.json()) as { reply: string; proposedAdjustment: ProposedAdjustment | null };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, proposedAdjustment: data.proposedAdjustment }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant couldn't respond - try again.");
    } finally {
      setSending(false);
    }
  }

  async function addProposedAdjustment(index: number, proposal: ProposedAdjustment) {
    setAddingIndex(index);
    setError(null);
    try {
      let scenarioId = activeScenario?.id;
      if (!scenarioId) {
        const name = newScenarioName || proposal.label;
        const res = await fetch("/api/what-if-scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error("Failed to create scenario");
        const created = (await res.json()) as { id: string };
        scenarioId = created.id;
        setActiveScenarioId(created.id);
      }

      const res = await fetch("/api/what-if-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          label: proposal.label,
          category: proposal.category,
          monthlyAmount: proposal.monthlyAmount,
          startDate: proposal.startDate,
          endDate: proposal.endDate,
        }),
      });
      if (!res.ok) throw new Error("Failed to add adjustment");

      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, added: true } : m)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to scenario");
    } finally {
      setAddingIndex(null);
    }
  }

  return (
    <Card
      title="Ask the What If assistant"
      action={
        <select
          value={activeScenarioId}
          onChange={(e) => setActiveScenarioId(e.target.value as string | "new")}
          className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
        >
          <option value="new">New scenario</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      }
      className="mb-6"
    >
      {activeScenarioId === "new" && (
        <input
          value={newScenarioName}
          onChange={(e) => setNewScenarioName(e.target.value)}
          placeholder="Name this scenario once you add something (optional - defaults to the first adjustment's label)"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 mb-3"
        />
      )}

      <div className="space-y-3 mb-3 max-h-[420px] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500">
            <p className="mb-2">Ask about a hypothetical change, or ask what&rsquo;s driving the current numbers. For example:</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-xs text-left px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:border-brand-500 hover:text-brand-300"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-brand-500/20 text-slate-100" : "bg-slate-800 text-slate-200"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.proposedAdjustment && (
                <div className="mt-2 pt-2 border-t border-slate-700/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-300">
                      <span className="font-medium text-white">{m.proposedAdjustment.label}</span>
                      <span className={`ml-2 tabular-nums ${m.proposedAdjustment.monthlyAmount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {formatAUDSigned(-m.proposedAdjustment.monthlyAmount)}/month
                      </span>
                      <span className="text-slate-500"> from {formatDateAU(m.proposedAdjustment.startDate)}</span>
                    </div>
                    {m.added ? (
                      <span className="text-xs text-emerald-400 shrink-0">Added</span>
                    ) : (
                      <button
                        onClick={() => addProposedAdjustment(i, m.proposedAdjustment!)}
                        disabled={addingIndex === i}
                        className="text-xs bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2 py-1 shrink-0"
                      >
                        {addingIndex === i ? "Adding..." : "Add to scenario"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="text-xs text-slate-500">Thinking...</div>}
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="What if we..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-4 py-2"
        >
          Send
        </button>
      </div>
    </Card>
  );
}
