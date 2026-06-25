import { ToggleRight } from "lucide-react";

export function ModuleToggle({ label, enabled, name }: { label: string; enabled: boolean; name?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
      <span className="font-semibold text-slate-950">{label}</span>
      {name ? <input className="peer sr-only" defaultChecked={enabled} name={name} type="checkbox" /> : null}
      <span className={name ? "text-slate-300 peer-checked:text-emerald-600" : enabled ? "text-emerald-600" : "text-slate-300"}>
        <ToggleRight className="h-7 w-7" />
      </span>
    </label>
  );
}
