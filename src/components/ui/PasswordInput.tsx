"use client";

import type { InputHTMLAttributes } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClasses } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        className={cn(inputClasses, "pr-12", className)}
        {...props}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
