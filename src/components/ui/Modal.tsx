import type { ReactNode } from "react";
import { Card } from "./Card";

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[2rem] bg-black/20 p-4">
      <Card className="mx-auto max-w-lg">
        <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  );
}
