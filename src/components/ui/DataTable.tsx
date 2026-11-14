import type { ReactNode } from "react";
type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
};

export function DataTable({ headers, rows, emptyMessage = "Sin registros." }: DataTableProps) {
  return (
    <div className="ui-data-table overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="divide-y divide-[var(--border)] md:hidden">
        {rows.length ? rows.map((row, rowIndex) => (
          <dl className="grid gap-3 p-4" key={rowIndex}>
            {row.map((cell, cellIndex) => <div className="grid min-w-0 gap-1" key={`${rowIndex}-${cellIndex}`}>
              <dt className="text-xs font-medium text-[var(--muted)]">{headers[cellIndex]}</dt>
              <dd className="min-w-0 break-words text-sm text-[var(--text)]">{cell}</dd>
            </div>)}
          </dl>
        )) : <p className="p-5 text-center text-sm text-[var(--muted)]">{emptyMessage}</p>}
      </div>
      <div className="admin-scrollbar hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[var(--color-surface)] text-xs text-[var(--muted)]">
            <tr>{headers.map(header => <th className="px-5 py-3.5 font-semibold" key={header} scope="col">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length ? rows.map((row, rowIndex) => (
              <tr className="bg-[var(--surface)]" key={rowIndex}>
                {row.map((cell, cellIndex) => <td className="px-5 py-4 text-[var(--text)]" data-numeric={typeof cell === "number" || undefined} key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            )) : <tr><td className="px-5 py-8 text-center text-sm text-[var(--muted)]" colSpan={headers.length}>{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
