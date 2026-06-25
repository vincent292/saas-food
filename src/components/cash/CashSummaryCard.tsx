import { WalletCards } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { formatMoney } from "@/lib/utils/money";

export function CashSummaryCard({ label, amount, detail }: { label: string; amount: number; detail?: string }) {
  return <StatCard detail={detail} icon={<WalletCards className="h-5 w-5" />} label={label} value={formatMoney(amount)} />;
}
