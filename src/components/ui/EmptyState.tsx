import { SearchX } from "lucide-react";
import { Card } from "./Card";
import { IllustrationAsset, type IllustrationName } from "./IllustrationAsset";

export function EmptyState({
  title,
  description,
  illustration,
}: {
  title: string;
  description: string;
  illustration?: IllustrationName;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {illustration ? (
        <IllustrationAsset className="max-w-[220px]" name={illustration} />
      ) : (
        <SearchX className="h-10 w-10 text-[var(--muted)]" />
      )}
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>
    </Card>
  );
}
