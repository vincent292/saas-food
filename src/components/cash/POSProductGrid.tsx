import { Plus } from "lucide-react";
import { createPosSaleAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { formatMoney } from "@/lib/utils/money";
import type { Product } from "@/types/product.types";

export function POSProductGrid({ products, restaurantId }: { products: Product[]; restaurantId: string }) {
  if (!products.length) {
    return <Card className="text-sm text-slate-500">Aun no hay productos disponibles para vender.</Card>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <Card className="p-4" key={product.id}>
          <form action={createPosSaleAction} className="space-y-3">
            <input name="restaurantId" type="hidden" value={restaurantId} />
            <input name="productId" type="hidden" value={product.id} />
            <p className="font-bold text-slate-950">{product.name}</p>
            <p className="text-sm text-slate-500">{formatMoney(product.price)}</p>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <Input aria-label={`Cantidad de ${product.name}`} min={1} name="quantity" type="number" defaultValue={1} />
              <Select aria-label={`Metodo de pago de ${product.name}`} name="paymentMethod" defaultValue="cash">
                <option value="cash">Efectivo</option>
                <option value="qr">QR</option>
                <option value="bank_transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </Select>
            </div>
            <Button className="w-full" title="Cobrar venta" type="submit">
              <Plus className="h-4 w-4" />
              Cobrar
            </Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
