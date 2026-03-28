/** Letterhead defaults; override with NEXT_PUBLIC_* in `.env.local`. */

export type CompanyBlock = {
  legalName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
};

export function getCompanyBlock(): CompanyBlock {
  return {
    legalName:
      process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? "Keystone Supply",
    line1: process.env.NEXT_PUBLIC_COMPANY_LINE1 ?? "",
    line2: process.env.NEXT_PUBLIC_COMPANY_LINE2 ?? "",
    city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? "",
    state: process.env.NEXT_PUBLIC_COMPANY_STATE ?? "",
    postalCode: process.env.NEXT_PUBLIC_COMPANY_POSTAL ?? "",
    country: process.env.NEXT_PUBLIC_COMPANY_COUNTRY ?? "USA",
    phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "",
    email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "",
  };
}

export function formatCompanyMultiline(c: CompanyBlock): string {
  const parts = [
    c.legalName,
    c.line1,
    c.line2,
    [c.city, c.state, c.postalCode].filter(Boolean).join(", "),
    c.country,
    c.phone ? `Tel: ${c.phone}` : "",
    c.email ? c.email : "",
  ].filter((s) => s && String(s).trim() !== "");
  return parts.join("\n");
}
