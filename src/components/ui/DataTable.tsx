import type { ReactNode } from "react";
type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
};

export function DataTable({ headers, rows, emptyMessage = "Sin registros." }: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <div className="divide-y divide-[var(--border)] md:hidden">
        {rows.length ? (
          rows.map((row, rowIndex) => (
            <div className="grid gap-3 p-4" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <div className="grid gap-1" key={`${rowIndex}-${cellIndex}`}>
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">{headers[cellIndex]}</span>
                  <div className="min-w-0 text-sm font-semibold text-[var(--text)]">{cell}</div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="p-5 text-center text-sm font-semibold text-[var(--muted)]">{emptyMessage}</div>
        )}
      </div>

      <div className="admin-scrollbar hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[var(--color-surface)] text-xs uppercase text-[var(--muted)]">
            <tr>
              {headers.map((header) => (
                <th className="px-5 py-4 font-bold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr className="bg-[var(--surface)]" key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td className="px-5 py-4 text-[var(--text)]" key={`${rowIndex}-${cellIndex}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr className="bg-[var(--surface)]">
                <td className="px-5 py-6 text-center text-sm font-semibold text-[var(--muted)]" colSpan={headers.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
