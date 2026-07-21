import { AdminLayout } from "@/components/layout/AdminLayout";
import { NewOwnerFormClient } from "@/components/restaurants/NewOwnerFormClient";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default function NewRestaurantPage() {
  return (
    <AdminLayout active="/admin/restaurantes" title="Nuevo dueno">
      <SectionTitle
        description="Crea solo el acceso del dueno. El restaurante se registra despues desde el panel del dueno, con sus datos publicos, logo, banner y ubicacion."
        title="Crear dueno de negocio"
      />
      <NewOwnerFormClient />
    </AdminLayout>
  );
}
