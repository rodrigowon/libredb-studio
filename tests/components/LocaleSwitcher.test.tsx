import "../setup-dom";
import React, { act } from "react";
import ReactDOMServer from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { mockRouterRefresh } from "../helpers/mock-navigation";
import { IntlTestProvider, renderWithIntl } from "../helpers/render-with-intl";
import type { Locale } from "@/i18n/config";

const { LocaleSwitcher } = await import("@/components/locale-switcher");

describe("LocaleSwitcher", () => {
  afterEach(() => {
    cleanup();
    mockRouterRefresh.mockClear();
  });

  test("renders the current locale and both supported options", () => {
    const { getByLabelText } = renderWithIntl(<LocaleSwitcher onLocaleChange={mock(async () => {})} />, "pt-BR");
    const select = getByLabelText("Idioma") as HTMLSelectElement;
    expect(select.value).toBe("pt-BR");
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ["pt-BR", "Português (Brasil)"],
      ["en", "English"],
    ]);
  });

  test("persists the new locale and refreshes the current URL", async () => {
    const persist = mock(async (_locale: string) => {});
    const { getByLabelText } = renderWithIntl(<LocaleSwitcher onLocaleChange={persist} />, "pt-BR");

    fireEvent.change(getByLabelText("Idioma"), { target: { value: "en" } });

    await waitFor(() => {
      expect(persist).toHaveBeenCalledWith("en");
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
    expect(window.location.pathname).toBe("/");
  });

  test("reflects the persisted locale after a server refresh", async () => {
    let persistedLocale: Locale = "pt-BR";
    const persist = mock(async (locale: string) => {
      persistedLocale = locale as Locale;
    });
    const first = renderWithIntl(<LocaleSwitcher onLocaleChange={persist} />, persistedLocale);

    fireEvent.change(first.getByLabelText("Idioma"), { target: { value: "en" } });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalledTimes(1));
    first.unmount();

    const refreshed = renderWithIntl(<LocaleSwitcher onLocaleChange={persist} />, persistedLocale);
    expect((refreshed.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
  });

  test("hydrates without a locale mismatch warning", async () => {
    const onLocaleChange = mock(async () => {});
    const element = (
      <IntlTestProvider locale="pt-BR">
        <LocaleSwitcher onLocaleChange={onLocaleChange} />
      </IntlTestProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = ReactDOMServer.renderToString(element);
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      consoleError.mockRestore();
    }
  });
});
