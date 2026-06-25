import type { ReactNode } from "react";
import { Card } from "./Card";

type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export function DataTable({ headers, rows }: DataTableProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              {headers.map((header) => (
                <th className="px-5 py-4 font-bold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row, rowIndex) => (
              <tr className="bg-white" key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td className="px-5 py-4 text-[var(--text)]" key={`${rowIndex}-${cellIndex}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
