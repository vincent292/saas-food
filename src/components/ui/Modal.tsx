import type { ReactNode } from "react";
import { Card } from "./Card";

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[2rem] bg-[var(--color-overlay)] p-4 backdrop-blur-sm">
      <Card className="mx-auto max-w-lg">
        <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  );
}
