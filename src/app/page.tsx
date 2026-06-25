import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChefHat, CreditCard, LogIn, QrCode, ShieldCheck, Store, Utensils } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { buttonClasses } from "@/components/ui/Button";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function Home() {
  const restaurants = await restaurantService.listRestaurants();
  const firstRestaurant = restaurants[0];
  const modules = [
    { title: "Menú white-label", icon: Utensils, text: "Slug público, tema editable, carrito y checkout." },
    { title: "Pedidos en vivo", icon: ChefHat, text: "Flujo para mesa QR, delivery, recojo y cocina." },
    { title: "Caja y POS", icon: CreditCard, text: "Venta rápida, cobros, movimientos y cierre diario." },
    { title: "Multi-tenant", icon: ShieldCheck, text: "Servicios filtrados por restaurante y RLS preparada." },
  ];

  return (
    <main className="min-h-screen bg-[#f7faf7] text-[#142018]">
      <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 font-black text-slate-950" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#1d8844] text-white">
              <Store className="h-5 w-5" />
            </span>
            Restaurant SaaS
          </Link>
          <div className="flex items-center gap-2">
            {firstRestaurant ? (
              <Link className={buttonClasses("secondary", "hidden sm:inline-flex")} href={`/r/${firstRestaurant.slug}`}>
                Ver menú
              </Link>
            ) : null}
            <Link className={buttonClasses("primary")} href="/admin/login">
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          </div>
        </div>
      </header>
      <section className="mx-auto grid min-h-[72vh] max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8 lg:py-12">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800">
            <Store className="h-4 w-4" />
            SaaS gastronómico multi-restaurante
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-tight text-slate-950 sm:text-6xl">Restaurant SaaS</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Plataforma premium para restaurantes, cafeterías y negocios gastronómicos con menú público, pedidos por mesa QR, cocina, caja, POS e inventario.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {firstRestaurant ? (
              <Link className={buttonClasses("primary", "px-6")} href={`/r/${firstRestaurant.slug}`}>
                Ver menú
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
            <Link className={buttonClasses("secondary", "px-6")} href="/admin/login">
              Iniciar sesión
            </Link>
          </div>
        </div>
        <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-slate-900 shadow-2xl">
          <Image
            alt="Restaurante moderno con mesas y servicio"
            className="h-full w-full object-cover opacity-80"
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1500&q=80"
          />
          <div className="absolute inset-x-5 bottom-5 rounded-[1.5rem] bg-white/92 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-emerald-700">Sistema listo para crecer</p>
                <p className="mt-1 text-2xl font-black text-slate-950">QR, POS, cocina e inventario</p>
              </div>
              <QrCode className="h-10 w-10 text-emerald-700" />
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <SectionTitle title="Módulos principales" description="La base ya está separada por dominios y preparada para Supabase." />
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => (
            <Card key={module.title}>
              <module.icon className="h-8 w-8 text-emerald-700" />
              <h2 className="mt-4 text-lg font-black">{module.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.text}</p>
            </Card>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <SectionTitle title="Restaurantes" description="Cada restaurante usa sus propios datos, tema y rutas públicas." />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {restaurants.map((restaurant) => (
            <Card className="flex items-center justify-between gap-4" key={restaurant.id}>
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-700 font-black text-white">{restaurant.logoUrl}</span>
                <div>
                  <h3 className="text-lg font-black">{restaurant.name}</h3>
                  <p className="text-sm text-slate-600">/r/{restaurant.slug}</p>
                </div>
              </div>
              <Link className={buttonClasses("secondary")} href={`/r/${restaurant.slug}`}>
                Abrir
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
