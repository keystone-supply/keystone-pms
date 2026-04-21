/** Letterhead defaults; override with NEXT_PUBLIC_* in `.env.local`. */

export type CompanyBlock = {
  legalName: string;
  // Mailing address (used for quotes, letterhead, general use)
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  // Physical / ship-from address (used on BOL and Invoice "SELLER" blocks)
  physicalLine1: string;
  physicalLine2: string;
  physicalCity: string;
  physicalState: string;
  physicalPostalCode: string;
  physicalCountry: string;
};

export function getCompanyBlock(): CompanyBlock {
  return {
    legalName:
      process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ??
      "Keystone Supply | Keystone Industrial",
    line1: process.env.NEXT_PUBLIC_COMPANY_LINE1 ?? "P.O. Box 129",
    line2: process.env.NEXT_PUBLIC_COMPANY_LINE2 ?? "",
    city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? "Riverside",
    state: process.env.NEXT_PUBLIC_COMPANY_STATE ?? "UT",
    postalCode: process.env.NEXT_PUBLIC_COMPANY_POSTAL ?? "84334",
    country: process.env.NEXT_PUBLIC_COMPANY_COUNTRY ?? "USA",
    phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "(435) 720-3714",
    email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "sales@keystone-supply.com",

    // Physical address for BOL/Invoice SELLER blocks
    physicalLine1:
      process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_LINE1 ?? "12090 North Hwy 38",
    physicalLine2: process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_LINE2 ?? "",
    physicalCity: process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_CITY ?? "Deweyville",
    physicalState: process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_STATE ?? "UT",
    physicalPostalCode:
      process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_POSTAL ?? "84309",
    physicalCountry:
      process.env.NEXT_PUBLIC_COMPANY_PHYSICAL_COUNTRY ?? "USA",
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

/** Physical address for BOL and Invoice "SELLER" / fromParty blocks */
export function formatPhysicalAddress(c: CompanyBlock): string {
  const parts = [
    c.legalName,
    c.physicalLine1,
    c.physicalLine2,
    [c.physicalCity, c.physicalState, c.physicalPostalCode]
      .filter(Boolean)
      .join(", "),
    c.physicalCountry,
    c.phone ? `Tel: ${c.phone}` : "",
  ].filter((s) => s && String(s).trim() !== "");
  return parts.join("\n");
}

/** Default “Account manager:” line on quote PDFs when metadata override is blank. */
export function getQuoteAccountManagerDefault(): string {
  const v = process.env.NEXT_PUBLIC_QUOTE_ACCOUNT_MANAGER?.trim();
  return v ?? "";
}
