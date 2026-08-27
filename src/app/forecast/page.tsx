import { PageHeader } from "@/components/shared/PageHeader";
import { ForecastClient } from "@/components/forecast/ForecastClient";
import { activeJobs, buildForecastItems, currentCashBalance } from "@/lib/calculations";
import { settings } from "@/lib/mock-data";

export default function ForecastPage() {
  const items = buildForecastItems();
  const jobOptions = activeJobs.map((j) => ({ id: j.id, label: `${j.id} - ${j.client}` }));

  return (
    <div>
      <PageHeader
        title="Forecast"
        description="Compare Conservative, Base and Optimistic assumptions, or stress-test a specific scenario against the base cash forecast."
      />
      <ForecastClient
        items={items}
        buffer={settings.minimumCashBuffer}
        openingBalance={currentCashBalance()}
        jobOptions={jobOptions}
      />
    </div>
  );
}
