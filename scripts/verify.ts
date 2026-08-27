import { activeJobs, jobCashPosition, jobCosting, currentCashBalance, buildForecastItems, cashForecastSeries, summarizeForecast, totalActiveJobCashRequirement, totalWip, totalOverdue, weightedPipelineValue, totalPipelineValue } from "../src/lib/calculations";
import { settings } from "../src/lib/mock-data";

console.log("Cash balance:", currentCashBalance());

for (const job of activeJobs) {
  const costing = jobCosting(job);
  const pos = jobCashPosition(job);
  console.log(
    job.id, job.client.padEnd(12),
    "margin%", costing.forecastMarginPercent.toFixed(1),
    "cashReq", Math.round(pos.cashRequiredToFinish),
    "nextPay", pos.nextPaymentLabel, pos.nextPaymentAmount,
    "wip", Math.round(pos.wip)
  );
}

console.log("Total active job cash requirement:", Math.round(totalActiveJobCashRequirement()));
console.log("Total WIP:", Math.round(totalWip()));
console.log("Total overdue:", Math.round(totalOverdue(0)));
console.log("Weighted pipeline:", Math.round(weightedPipelineValue()), "/ total", Math.round(totalPipelineValue()));

const items = buildForecastItems();
console.log("Forecast items:", items.length);
const daily = cashForecastSeries(items, 90);
const summary = summarizeForecast(daily, settings.minimumCashBuffer);
console.log(summary);

console.log("--- daily series (first 40 days) ---");
for (const d of daily.slice(0, 40)) {
  if (d.inflows > 0 || d.outflows > 0) {
    console.log(d.date, "open", Math.round(d.openingBalance), "in", Math.round(d.inflows), "out", Math.round(d.outflows), "close", Math.round(d.closingBalance));
  }
}
