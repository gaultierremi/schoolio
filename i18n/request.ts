import { getRequestConfig } from "next-intl/server";

export const locales = ["fr"] as const;
export const defaultLocale = "fr" as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import(`../messages/${defaultLocale}.json`)).default,
}));
