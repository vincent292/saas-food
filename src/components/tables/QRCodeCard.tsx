import { QrCode } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function QRCodeCard({ url }: { url: string }) {
  return (
    <Card className="text-center">
      <div className="mx-auto grid h-36 w-36 place-items-center rounded-3xl border border-[var(--border)] bg-white">
        <QrCode className="h-20 w-20 text-[var(--primary)]" />
      </div>
      <p className="mt-4 break-all text-sm font-semibold text-[var(--text)]">{url}</p>
    </Card>
  );
}
