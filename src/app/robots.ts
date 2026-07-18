import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/caja/",
        "/cocina/",
        "/delivery/",
        "/r/",
        "/*/checkout",
        "/*/pedido",
        "/*/seguimiento",
        "/*/mesa",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
