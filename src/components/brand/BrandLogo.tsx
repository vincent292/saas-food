import Image from "next/image";
import { cn } from "@/lib/utils/cn";

type BrandLogoVariant = "light" | "dark" | "monochromeBlue" | "monochromeWhite";

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  compact?: boolean;
  className?: string;
  priority?: boolean;
};

const logoSources: Record<BrandLogoVariant, string> = {
  light: "/brand/yopido-logo-light.png",
  dark: "/brand/yopido-logo-dark.png",
  monochromeBlue: "/brand/yopido-logo-monochrome-blue.png",
  monochromeWhite: "/brand/yopido-logo-monochrome-white.png",
};

const iconSources: Record<BrandLogoVariant, string> = {
  light: "/brand/yopido-icon-light-1024.png",
  dark: "/brand/yopido-icon-dark-1024.png",
  monochromeBlue: "/brand/yopido-icon-monochrome-blue-1024.png",
  monochromeWhite: "/brand/yopido-icon-monochrome-white-1024.png",
};

export function BrandLogo({ variant = "light", compact = false, className, priority = false }: BrandLogoProps) {
  return (
    <Image
      alt="yopido.shop"
      className={cn("shrink-0 object-contain", className)}
      height={compact ? 1024 : 395}
      priority={priority}
      sizes={compact ? "64px" : "(max-width: 640px) 150px, 210px"}
      src={compact ? iconSources[variant] : logoSources[variant]}
      width={compact ? 1024 : 1800}
    />
  );
}
