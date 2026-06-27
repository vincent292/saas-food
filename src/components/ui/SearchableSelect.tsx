"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

export type SearchOption = {
  value: string;
  label: string;
  detail?: string;
};

export function SearchableSelect({
  name,
  options,
  placeholder,
  required,
  emptyText = "Sin resultados",
}: {
  name: string;
  options: SearchOption[];
  placeholder: string;
  required?: boolean;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchOption | null>(null);
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options.slice(0, 8);
    }
    return options
      .filter((option) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [options, query]);

  function choose(option: SearchOption) {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input name={name} required={required} type="hidden" value={selected?.value ?? ""} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          className="min-h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-11 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-light)]"
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          value={query}
        />
        {query ? (
          <button
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-slate-100 text-slate-500"
            onClick={() => {
              setQuery("");
              setSelected(null);
              setOpen(true);
            }}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[var(--border)] bg-white p-2 shadow-xl">
          {filtered.length ? (
            filtered.map((option) => (
              <button
                className={cn("block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--primary-light)]", selected?.value === option.value && "bg-[var(--primary-light)]")}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                type="button"
              >
                <span className="block font-black text-[var(--text)]">{option.label}</span>
                {option.detail ? <span className="block text-xs font-semibold text-[var(--muted)]">{option.detail}</span> : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm font-semibold text-[var(--muted)]">{emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
