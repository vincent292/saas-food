"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";
import { createWaiterAction, type CreateWaiterFormState } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

const initialState: CreateWaiterFormState = {};
const errors: Record<string, string> = {
  invalid: "Completa el nombre, correo y sucursal.",
  "owner-required": "Solo el dueno puede crear meseros para esta sucursal.",
  "service-role-required": "Falta configurar el servicio para crear usuarios.",
  "waiter-create": "No se pudo crear el usuario del mesero.",
  "waiter-email-exists": "Ese correo ya pertenece a otro usuario.",
  "waiter-limit": "Esta sucursal ya alcanzo el cupo de meseros activos configurado.",
  "waiter-membership": "No se pudo asignar el mesero a la sucursal.",
  "waiter-profile": "No se pudo completar el perfil del mesero.",
};

export function CreateWaiterClient({
  restaurants,
}: {
  restaurants: Array<{ id: string; name: string; activeWaiters: number; waiterLimit: number }>;
}) {
  const [state, action, pending] = useActionState(createWaiterAction, initialState);
  const availableRestaurant = restaurants.find((restaurant) => restaurant.activeWaiters < restaurant.waiterLimit);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Sucursal</span>
        <Select defaultValue={availableRestaurant?.id ?? ""} name="restaurantId" required>
          {!availableRestaurant ? <option value="">Sin cupos disponibles</option> : null}
          {restaurants.map((restaurant) => (
            <option disabled={restaurant.activeWaiters >= restaurant.waiterLimit} key={restaurant.id} value={restaurant.id}>
              {restaurant.name} ({restaurant.activeWaiters}/{restaurant.waiterLimit} activos)
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Nombre completo</span>
        <Input autoComplete="name" maxLength={120} name="fullName" required />
      </label>
      <label className="grid gap-1.5 md:col-span-2">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Correo de acceso</span>
        <Input autoComplete="email" name="email" required type="email" />
      </label>
      <label className="grid gap-1.5 md:col-span-2">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Contraseña temporal</span>
        <PasswordInput autoComplete="new-password" minLength={12} name="temporaryPassword" required />
        <span className="text-xs font-semibold text-[var(--color-secondary-text)]">Mínimo 12 caracteres, con mayúscula, minúscula y número. El mesero deberá cambiarla al ingresar.</span>
      </label>
      {state.error ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)] md:col-span-2">
          {errors[state.error] ?? "No se pudo crear el mesero."}
        </p>
      ) : null}
      {state.success ? (
        <div className="rounded-[var(--radius-control)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)] md:col-span-2">
          <p>Mesero creado. Comparte la contraseña temporal que definiste; deberá cambiarla al ingresar.</p>
        </div>
      ) : null}
      <div className="md:col-span-2 md:justify-self-end">
        <button className={buttonClasses("primary")} disabled={pending || !restaurants.some((restaurant) => restaurant.activeWaiters < restaurant.waiterLimit)} type="submit">
          <UserPlus className="h-4 w-4" />
          {pending ? "Creando..." : "Crear mesero"}
        </button>
      </div>
    </form>
  );
}
