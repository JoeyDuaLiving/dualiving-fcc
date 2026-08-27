export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/60 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          {typeof title === "string" ? <h2 className="text-sm font-semibold text-white">{title}</h2> : title}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
