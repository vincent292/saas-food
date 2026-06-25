import { SearchX } from "lucide-react";
import { Card } from "./Card";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <SearchX className="h-10 w-10 text-[var(--muted)]" />
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>
    </Card>
  );
}
