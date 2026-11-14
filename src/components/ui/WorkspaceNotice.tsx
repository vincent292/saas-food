import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Inline feedback for a workspace. Keep the message present until the user navigates. */
export function WorkspaceNotice({ title, children, tone = "info" }: {
  title: string;
  children?: ReactNode;
  tone?: "success" | "error" | "info";
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? CircleAlert : Info;
  return (
    <div className={cn("workspace-notice", `workspace-notice--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm leading-6">{children}</div> : null}
      </div>
    </div>
  );
}
