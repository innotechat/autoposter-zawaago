export const BRAND_LOGOS = {
  Zawaago: "/brand/zawaago-logo-final.svg",
  InnoTech: "/brand/innotech-logo-final.svg",
} as const;

export type BrandName = keyof typeof BRAND_LOGOS;

export function brandLogoPath(brand: string): string | null {
  const normalized = brand.trim().toLowerCase();
  if (normalized === "zawaago") return BRAND_LOGOS.Zawaago;
  if (normalized === "innotech" || normalized === "inno tech") return BRAND_LOGOS.InnoTech;
  return null;
}
