"use client";

import { CheckCircle2, KeyRound, LogOut, Mail, MapPin, Phone, Plus, ReceiptText, UserRound, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  createPublicCustomerAddress,
  customerErrorMessage,
  notifyCustomerAccountChanged,
  registerPublicCustomer,
  signInPublicCustomer,
  signInPublicCustomerWithGoogle,
  signOutPublicCustomer,
  updatePublicCustomerProfile,
  type PublicCustomerAccount,
} from "@/lib/client/customer-account";
import { createCustomerClient } from "@/lib/supabase/customer-client";
import { cn } from "@/lib/utils/cn";
import { formatShortDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import { usePublicCustomerStore } from "@/stores/public-customer-store";

type ButtonTone = "onPrimary" | "surface" | "plain";
type CustomerAuthMode = "login" | "register";
type CustomerPanel = "profile" | "orders";

export function PublicCustomerAccountButton({
  buttonClassName,
  buttonContent,
  compact = false,
  initialMode = "login",
  initialOpen = false,
  initialPanel = "profile",
  showCompactLabel = false,
  tone = "onPrimary",
}: {
  buttonClassName?: string;
  buttonContent?: ReactNode;
  compact?: boolean;
  initialMode?: CustomerAuthMode;
  initialOpen?: boolean;
  initialPanel?: CustomerPanel;
  showCompactLabel?: boolean;
  tone?: ButtonTone;
}) {
  const [open, setOpen] = useState(initialOpen);
  const account = usePublicCustomerStore((state) => state.account);
  const sessionEmail = usePublicCustomerStore((state) => state.sessionEmail);
  const sessionName = usePublicCustomerStore((state) => state.sessionName);
  const mustChangePassword = usePublicCustomerStore((state) => state.mustChangePassword);
  const loading = usePublicCustomerStore((state) => state.loading);
  const refreshAccount = usePublicCustomerStore((state) => state.refreshCustomerAccount);
  const closeModal = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshAccount();
    }, 0);
    const supabase = createCustomerClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshAccount();
    });
    window.addEventListener("yopido:customer-account-changed", refreshAccount);
    return () => {
      window.clearTimeout(initialRefresh);
      data.subscription.unsubscribe();
      window.removeEventListener("yopido:customer-account-changed", refreshAccount);
    };
  }, [refreshAccount]);

  const label = account.profile?.fullName?.split(" ")[0] || sessionEmail.split("@")[0] || "Mi Yopido";
  const defaultButtonClassName = cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-black transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
    compact ? "h-10 w-10" : "min-h-10 px-3 sm:min-h-12 sm:px-4",
    tone === "onPrimary" && "border border-white/22 bg-white/8 text-white shadow-sm backdrop-blur hover:bg-white/14",
    tone === "surface" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] shadow-sm hover:bg-[var(--primary-light)]",
    tone === "plain" && "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22]",
  );

  return (
    <>
      <button aria-label="Abrir Mi Yopido" className={buttonClassName ?? defaultButtonClassName} onClick={() => setOpen(true)} type="button">
        {buttonContent ?? (
          <>
            <UserRound className="h-5 w-5 sm:h-6 sm:w-6" />
            {!compact || showCompactLabel ? <span className={compact && !showCompactLabel ? "hidden" : "hidden sm:inline"}>{sessionEmail ? label : "Mi Yopido"}</span> : null}
          </>
        )}
      </button>
      {open ? (
        <CustomerAccountModal
          account={account}
          key={`${sessionEmail}:${sessionName}:${account.profile?.updatedAt ?? account.profile?.id ?? "guest"}`}
          loading={loading}
          initialMode={initialMode}
          initialPanel={initialPanel}
          onClose={closeModal}
          onRefresh={refreshAccount}
          sessionEmail={sessionEmail}
          sessionName={sessionName}
          mustChangePassword={mustChangePassword}
        />
      ) : null}
    </>
  );
}

const orderStatusLabels = {
  pending: "Recibido",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
} as const;

const orderTypeLabels = {
  delivery: "Delivery",
  pickup: "Recojo",
  table: "Mesa",
  pos: "POS",
} as const;

function CustomerAccountModal({
  account,
  loading,
  initialMode,
  initialPanel,
  onClose,
  onRefresh,
  sessionEmail,
  sessionName,
  mustChangePassword,
}: {
  account: PublicCustomerAccount;
  loading: boolean;
  initialMode: CustomerAuthMode;
  initialPanel: CustomerPanel;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  sessionEmail: string;
  sessionName: string;
  mustChangePassword: boolean;
}) {
  const [mode, setMode] = useState<CustomerAuthMode>(initialMode);
  const [panel, setPanel] = useState<CustomerPanel>(initialPanel);
  const [email, setEmail] = useState(sessionEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(account.profile?.fullName ?? sessionName);
  const [phone, setPhone] = useState(account.profile?.phone ?? "");
  const [documentNumber, setDocumentNumber] = useState(account.profile?.documentNumber ?? "");
  const [editingProfile, setEditingProfile] = useState(!account.profile);
  const [addressLabel, setAddressLabel] = useState("");
  const [address, setAddress] = useState("");
  const [addressCoordinates, setAddressCoordinates] = useState<{ latitude: number; longitude: number; mapsUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [publicTheme, setPublicTheme] = useState<"light" | "dark">("light");

  const loggedIn = Boolean(sessionEmail);
  const profileComplete = Boolean(account.profile);
  const orders = account.orders ?? [];
  const firstName = useMemo(() => {
    const fromProfile = account.profile?.fullName?.trim().split(/\s+/)[0];
    return fromProfile || sessionEmail.split("@")[0] || "";
  }, [account.profile?.fullName, sessionEmail]);

  useEffect(() => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const sourceTheme = document.querySelector<HTMLElement>(".public-brand-theme")?.dataset.publicTheme;
    const mountTimer = window.setTimeout(() => {
      setPublicTheme(sourceTheme === "dark" ? "dark" : "light");
      setPortalReady(true);
    }, 0);

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(mountTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      activeElement?.focus();
    };
  }, [onClose]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        await registerPublicCustomer({
          documentNumber,
          email,
          fullName,
          password,
          phone,
        });
      }
      await signInPublicCustomer(email, password);
      setPassword("");
      notifyCustomerAccountChanged();
      await onRefresh();
      setMessage(mode === "register" ? "Cuenta creada. Ya puedes guardar direcciones." : "Sesion iniciada.");
    } catch (nextError) {
      setError(customerErrorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function submitGoogleAuth() {
    setGoogleSaving(true);
    setError("");
    setMessage("");
    try {
      await signInPublicCustomerWithGoogle();
    } catch (nextError) {
      setGoogleSaving(false);
      setError(customerErrorMessage(nextError));
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updatePublicCustomerProfile({ documentNumber, fullName, phone });
      await onRefresh();
      setEditingProfile(false);
      setMessage("Datos guardados.");
    } catch (nextError) {
      setError(customerErrorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createPublicCustomerAddress({
        address,
        isDefault: account.addresses.length === 0,
        label: addressLabel || `Direccion ${account.addresses.length + 1}`,
        latitude: addressCoordinates?.latitude,
        longitude: addressCoordinates?.longitude,
        mapsUrl: addressCoordinates?.mapsUrl,
      });
      setAddress("");
      setAddressLabel("");
      setAddressCoordinates(null);
      await onRefresh();
      setMessage("Direccion guardada.");
    } catch (nextError) {
      setError(customerErrorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function changeRequiredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setSaving(false);
      setError("La nueva contrasena debe tener minimo 12 caracteres, mayuscula, minuscula y numero.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setSaving(false);
      setError("Las contrasenas no coinciden.");
      return;
    }

    try {
      const supabase = createCustomerClient();
      const { data } = await supabase.auth.getUser();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          ...(data.user?.user_metadata ?? {}),
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
        },
      });

      if (updateError) throw updateError;

      setNewPassword("");
      setConfirmNewPassword("");
      await onRefresh();
      setMessage("Contrasena actualizada.");
    } catch {
      setError("No se pudo actualizar la contrasena.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await signOutPublicCustomer();
    await onRefresh();
  }

  if (!portalReady) return null;

  return createPortal(
    <div
      className="public-brand-theme fixed inset-0 z-[200] flex items-stretch justify-center bg-[rgb(8_36_65_/_0.68)] p-0 text-[var(--text)] backdrop-blur-sm sm:items-center sm:p-4"
      data-public-theme={publicTheme}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mi Yopido"
    >
      <div
        className="relative flex h-dvh max-h-dvh w-full max-w-[62rem] flex-col overflow-hidden bg-[var(--surface)] shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-[1.5rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Cerrar Mi Yopido"
          className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl ring-1 ring-black/8 transition hover:scale-105 active:scale-95 sm:top-3"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={cn("flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] bg-[#12355B] pr-20 pt-[calc(1rem+env(safe-area-inset-top))] text-white sm:pt-4", loggedIn ? "px-5 pb-5 pr-20" : "px-5 pb-4 pr-20")}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--accent)]">Mi Yopido</p>
            {loggedIn ? (
              <>
                <h2 className="mt-1 text-2xl font-black">Hola {firstName || "bienvenido"}</h2>
                <p className="mt-1 text-sm font-semibold text-white/74">Datos, direcciones y pedidos sin volver a escribir todo.</p>
              </>
            ) : null}
          </div>
        </div>

        <div className="admin-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          {loading ? <div className="rounded-3xl bg-[var(--color-surface)] p-5 text-sm font-black text-[var(--muted)]">Cargando Mi Yopido...</div> : null}

          {!loading && !loggedIn ? (
            <form className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1fr)] lg:items-start" onSubmit={submitAuth}>
              <AuthWelcomePanel mode={mode} />
              <div className="grid gap-4">
                {initialPanel === "orders" ? (
                  <div className="rounded-[1.25rem] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--primary)]">
                    Puedes pedir sin cuenta. Inicia sesion solo si quieres guardar tus pedidos y verlos despues aqui.
                  </div>
                ) : null}
                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-black text-[var(--text)] shadow-sm transition hover:bg-[var(--color-surface)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                  disabled={saving || googleSaving}
                  onClick={submitGoogleAuth}
                  type="button"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-base font-black text-[#4285F4] shadow-sm ring-1 ring-black/10">G</span>
                  {googleSaving ? "Conectando con Google..." : "Continuar con Google"}
                </button>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                  <span className="h-px bg-[var(--border)]" />
                  O usa correo
                  <span className="h-px bg-[var(--border)]" />
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] bg-[var(--primary-light)] p-1">
                  <button className={cn("min-h-11 rounded-full text-sm font-black text-[var(--muted)] transition", mode === "login" && "bg-[var(--primary)] text-white shadow-sm")} onClick={() => setMode("login")} type="button">Ingresar</button>
                  <button className={cn("min-h-11 rounded-full text-sm font-black text-[var(--muted)] transition", mode === "register" && "bg-[var(--primary)] text-white shadow-sm")} onClick={() => setMode("register")} type="button">Registro</button>
                </div>
                <div className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-card)] p-3 shadow-[0_18px_48px_rgb(18_53_91_/_0.08)] sm:p-4">
                  {mode === "register" ? (
                    <>
                      <Input onChange={(event) => setFullName(event.target.value)} placeholder="Nombre completo" required value={fullName} />
                      <Input onChange={(event) => setPhone(event.target.value)} placeholder="Telefono / WhatsApp" required type="tel" value={phone} />
                      <Input onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Carnet de identidad" required value={documentNumber} />
                    </>
                  ) : null}
                  <Input autoCapitalize="none" autoComplete="email" inputMode="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="Correo electronico" required type="email" value={email} />
                  <Input autoComplete={mode === "login" ? "current-password" : "new-password"} name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Contrasena" required type="password" value={password} />
                </div>
                {error ? <Feedback tone="error">{error}</Feedback> : null}
                {message ? <Feedback tone="success">{message}</Feedback> : null}
                <Button className="min-h-12 w-full" disabled={saving || googleSaving} type="submit">{saving ? "Validando..." : mode === "login" ? "Iniciar sesion" : "Crear cuenta"}</Button>
              </div>
            </form>
          ) : null}

          {!loading && loggedIn ? (
            <div className="grid gap-4">
              {mustChangePassword ? (
                <>
                  <section className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"><KeyRound className="h-5 w-5" /></span>
                      <div>
                        <h3 className="text-lg font-black">Cambia tu contrasena</h3>
                        <p className="text-sm font-semibold text-[var(--muted)]">Tu clave actual es temporal.</p>
                      </div>
                    </div>
                    <form className="mt-4 grid gap-3" onSubmit={changeRequiredPassword}>
                      <Input autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contrasena" required type="password" value={newPassword} />
                      <Input autoComplete="new-password" onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="Confirmar contrasena" required type="password" value={confirmNewPassword} />
                      <Button disabled={saving} type="submit">{saving ? "Actualizando..." : "Guardar nueva contrasena"}</Button>
                    </form>
                  </section>
                  {error ? <Feedback tone="error">{error}</Feedback> : null}
                  {message ? <Feedback tone="success">{message}</Feedback> : null}
                  <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-danger-soft)] px-4 text-sm font-black text-[var(--color-danger-strong)]" onClick={logout} type="button">
                    <LogOut className="h-4 w-4" />
                    Cerrar sesion
                  </button>
                </>
              ) : (
                <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard icon={<CheckCircle2 className="h-5 w-5" />} label="Perfil" value={profileComplete ? "Listo" : "Falta"} />
                <SummaryCard icon={<MapPin className="h-5 w-5" />} label="Direcciones" value={String(account.addresses.length)} />
                <SummaryCard icon={<ReceiptText className="h-5 w-5" />} label="Pedidos" value={String(orders.length)} />
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] bg-[var(--primary-light)] p-1">
                <button className={cn("min-h-11 rounded-full text-sm font-black text-[var(--muted)] transition", panel === "profile" && "bg-[var(--primary)] text-white shadow-sm")} onClick={() => setPanel("profile")} type="button">
                  Perfil
                </button>
                <button className={cn("min-h-11 rounded-full text-sm font-black text-[var(--muted)] transition", panel === "orders" && "bg-[var(--primary)] text-white shadow-sm")} onClick={() => setPanel("orders")} type="button">
                  Pedidos
                </button>
              </div>

              {panel === "profile" ? (
                <>
              <section className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Datos</p>
                    <h3 className="mt-1 text-xl font-black">{account.profile?.fullName || "Completa tu perfil"}</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{sessionEmail}</p>
                  </div>
                  {account.profile && !editingProfile ? (
                    <button className="rounded-full bg-[var(--primary-light)] px-4 py-2 text-sm font-black text-[var(--primary)]" onClick={() => setEditingProfile(true)} type="button">
                      Editar
                    </button>
                  ) : null}
                </div>
                {editingProfile ? (
                  <form className="mt-4 grid gap-3" onSubmit={saveProfile}>
                    <Input onChange={(event) => setFullName(event.target.value)} placeholder="Nombre completo" required value={fullName} />
                    <Input onChange={(event) => setPhone(event.target.value)} placeholder="Telefono / WhatsApp" required type="tel" value={phone} />
                    <Input onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Carnet de identidad" required value={documentNumber} />
                    <Button disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar datos"}</Button>
                  </form>
                ) : account.profile ? (
                  <div className="mt-4 grid gap-2">
                    <ReadLine icon={<UserRound className="h-4 w-4" />} label="Nombre" value={account.profile.fullName} />
                    <ReadLine icon={<Phone className="h-4 w-4" />} label="Telefono" value={account.profile.phone} />
                    <ReadLine icon={<ReceiptText className="h-4 w-4" />} label="Carnet" value={account.profile.documentNumber} />
                  </div>
                ) : null}
              </section>

              <section className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"><MapPin className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-lg font-black">Direcciones guardadas</h3>
                    <p className="text-sm font-semibold text-[var(--muted)]">El checkout usara una de estas direcciones automaticamente.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {account.addresses.length ? account.addresses.map((item) => (
                    <div className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]" key={item.id}>
                      <p className="font-black">{item.label}{item.isDefault ? <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black text-[var(--primary)]">Principal</span> : null}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.address}</p>
                    </div>
                  )) : <p className="rounded-2xl bg-[var(--color-surface)] p-3 text-sm font-bold text-[var(--muted)]">Aun no tienes direcciones guardadas.</p>}
                </div>

                {account.profile ? (
                  <form className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4" onSubmit={saveAddress}>
                    <Input onChange={(event) => setAddressLabel(event.target.value)} placeholder="Alias: Casa, trabajo..." value={addressLabel} />
                    <Input onChange={(event) => setAddress(event.target.value)} placeholder="Direccion o referencia visible para el restaurante" required value={address} />
                    <GoogleLocationFields
                      hideCoordinateInputs
                      hideMapsUrlInput
                      label="Ubicacion de entrega"
                      latitudeName="customerAddressLatitude"
                      longitudeName="customerAddressLongitude"
                      mapHeightClassName="h-[280px]"
                      mapsUrlName="customerAddressMapsUrl"
                      onCoordinatesChange={setAddressCoordinates}
                    />
                    <Button disabled={saving || !address.trim() || !addressCoordinates} type="submit">
                      <Plus className="h-4 w-4" />
                      {saving ? "Guardando..." : "Guardar direccion"}
                    </Button>
                  </form>
                ) : null}
              </section>
                </>
              ) : (
                <section className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"><ReceiptText className="h-5 w-5" /></span>
                    <div>
                      <h3 className="text-lg font-black">Tus pedidos</h3>
                      <p className="text-sm font-semibold text-[var(--muted)]">Guardamos los pedidos hechos con tu cuenta o con tu telefono registrado.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {orders.length ? orders.map((order) => (
                      <div className="rounded-[1.15rem] bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]" key={order.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-black text-[var(--text)]">{order.restaurantName}</p>
                            <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                              {order.orderNumber} | {orderTypeLabels[order.orderType]} | {formatShortDate(order.createdAt)}
                            </p>
                          </div>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-black", order.status === "cancelled" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : order.status === "delivered" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--primary-light)] text-[var(--primary)]")}>
                            {orderStatusLabels[order.status]}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-lg font-black text-[var(--primary)]">{formatMoney(order.total)}</p>
                          {order.restaurantSlug ? (
                            <a
                              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--primary)] px-4 text-sm font-black text-white"
                              href={`${publicRestaurantPath(order.restaurantSlug, `pedido/${order.id}`)}?token=${order.trackingToken}`}
                            >
                              Ver seguimiento
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-bold text-[var(--muted)]">
                        Todavia no hay pedidos guardados. Igual puedes pedir sin cuenta; si usas este telefono, apareceran aqui cuando inicies sesion.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {error ? <Feedback tone="error">{error}</Feedback> : null}
              {message ? <Feedback tone="success">{message}</Feedback> : null}
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-danger-soft)] px-4 text-sm font-black text-[var(--color-danger-strong)]" onClick={logout} type="button">
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AuthWelcomePanel({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";

  return (
    <section className="relative overflow-hidden rounded-[1.65rem] bg-[#12355B] p-5 text-white shadow-[0_24px_70px_rgb(8_36_65_/_0.24)]">
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--accent)]" />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.12),transparent_42%),linear-gradient(90deg,transparent_0%,rgb(199_240_0_/_0.12)_100%)]" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo className="h-9 w-auto max-w-[176px]" priority={false} variant="dark" />
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[var(--accent)] ring-1 ring-white/16">
            {isRegister ? <UserRound className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
          </span>
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-[var(--accent)]">{isRegister ? "Cuenta nueva" : "Mi Yopido"}</p>
        <h3 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{isRegister ? "Bienvenido a yopido.shop" : "Entra a tu cuenta"}</h3>
        <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-white/76">
          {isRegister ? "Crea tu perfil para guardar tus datos y pedir mas rapido." : "Accede con tu correo para usar tus datos guardados."}
        </p>
      </div>
    </section>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <p className="mt-3 text-2xl font-black text-[var(--primary)]">{value}</p>
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
    </div>
  );
}

function ReadLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
        <p className="truncate text-sm font-black text-[var(--text)]">{value}</p>
      </div>
    </div>
  );
}

function Feedback({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <p className={cn("rounded-2xl p-3 text-sm font-black", tone === "error" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
      {children}
    </p>
  );
}
