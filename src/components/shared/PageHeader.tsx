export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {description && <p className="text-sm text-slate-400 mt-1 max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}
