import { loadStockPosition } from "@/lib/stock-source";

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const stock = await loadStockPosition();

  const header = ["Job Number", "Client", "Order Number", "Description", "Amount", "Date", "Status"];
  const rows = stock.drawdowns.map((d) => [d.jobNumber, d.client, d.orderNumber, d.description, d.amount, d.date, d.status]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-drawdowns-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
