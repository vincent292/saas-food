import type { ReactNode } from "react";
import { Card } from "./Card";

export function Drawer({ children }: { children: ReactNode }) {
  return <Card className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto">{children}</Card>;
}
