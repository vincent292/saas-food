import { ToggleRight } from "lucide-react";

export function ModuleToggle({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
      <span className="font-semibold text-slate-950">{label}</span>
      <span className={enabled ? "text-emerald-600" : "text-slate-300"}>
        <ToggleRight className="h-7 w-7" />
      </span>
    </div>
  );
}
