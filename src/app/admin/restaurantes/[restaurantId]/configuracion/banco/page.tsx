import Link from "next/link";
import { BranchBankPanel } from "@/components/settings/BranchBankPanel";
import { bankBranchConnectionService } from "@/lib/services/bank-qr.service";
import { bankVaultConfigured } from "@/lib/payments/credential-vault";
export default async function BranchBankPage({ params, searchParams }: { params: Promise<{ restaurantId: string }>; searchParams: Promise<{ result?: string }> }) {
  const { restaurantId } = await params;
  // Server-side owner guard runs before returning any connection metadata.
  const connections = await bankBranchConnectionService.list(restaurantId);
  return <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
    <Link className="inline-flex min-h-11 items-center text-sm font-bold underline" href={`/admin/restaurantes/${restaurantId}/configuracion?tab=pagos`}>Volver a pagos</Link>
    <h1 className="text-2xl font-black">QR dinámico · Baneco</h1>
    <BranchBankPanel restaurantId={restaurantId} connections={connections} configured={bankVaultConfigured()} result={(await searchParams).result} />
  </main>;
}
