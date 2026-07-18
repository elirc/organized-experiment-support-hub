import { cn } from "@/lib/utils/cn";

export const MetricCard = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}) => (
  <div
    className={cn(
      "rounded-3xl border px-5 py-4 shadow-sm",
      tone === "default" && "border-stone-200 bg-white",
      tone === "warning" && "border-amber-200 bg-amber-50",
      tone === "danger" && "border-rose-200 bg-rose-50",
    )}
  >
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</div>
    <div className="mt-3 text-3xl font-semibold text-stone-900">{value}</div>
  </div>
);
