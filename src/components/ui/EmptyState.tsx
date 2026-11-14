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
    <Card className="ui-empty-state flex flex-col items-center justify-center gap-3 py-10 text-center">
      {illustration ? (
        <IllustrationAsset className="max-w-[220px]" name={illustration} />
      ) : (
        <SearchX aria-hidden="true" className="h-8 w-8 text-[var(--muted)]" />
      )}
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--text)]">{title}</h3>
        <p className="mt-2 max-w-[55ch] text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      </div>
    </Card>
  );
}
