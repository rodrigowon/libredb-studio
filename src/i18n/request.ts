import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return {
    locale,
    messages: loadMessages(locale),
  };
});
