import type { ReactElement, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render } from "@testing-library/react";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";

export function IntlTestProvider({ children, locale = "en" }: { children: ReactNode; locale?: Locale }) {
  return (
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)}>
      {children}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement, locale: Locale = "en") {
  return render(<IntlTestProvider locale={locale}>{ui}</IntlTestProvider>);
}
