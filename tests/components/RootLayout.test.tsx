import "../setup-dom";
import { mock } from "bun:test";
import React from "react";
import ReactDOMServer from "react-dom/server";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";

mock.module("geist/font/sans", () => ({
  GeistSans: { variable: "mock-geist-sans", className: "mock-geist-sans" },
}));
mock.module("geist/font/mono", () => ({
  GeistMono: { variable: "mock-geist-mono", className: "mock-geist-mono" },
}));

mock.module("@/components/ui/sonner", () => ({
  Toaster: (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-testid": "toaster",
      "data-position": props.position,
      "data-theme": props.theme,
    }),
}));

let currentLocale: Locale = "en";

mock.module("@/i18n/server", () => ({
  getAppLocale: async () => currentLocale,
  getAppMessages: async () => loadMessages(currentLocale),
  getAppFormatter: async () => ({
    list: (values: string[], options?: Intl.ListFormatOptions) =>
      new Intl.ListFormat(currentLocale, options).format(values),
  }),
  getAppTranslations: async (namespace: "Metadata") => {
    const messages = loadMessages(currentLocale)[namespace];
    return (key: keyof typeof messages, values?: Record<string, string>) => {
      let message = messages[key];
      for (const [name, value] of Object.entries(values ?? {})) {
        message = message.replace(`{${name}}`, value);
      }
      return message;
    };
  },
}));

const { default: RootLayout, generateMetadata } = await import("@/app/layout");
const { ThemeProvider } = await import("@/components/theme-provider");

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

async function renderLayout(children: React.ReactNode) {
  return RootLayout({ children });
}

describe("RootLayout", () => {
  afterEach(() => {
    currentLocale = "en";
    cleanup();
  });

  test("generates English metadata", async () => {
    currentLocale = "en";
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("LibreDB Studio | Universal Database Editor");
    expect(metadata.description).toBe("Manage PostgreSQL, MySQL, and SQLite in one web-based interface.");
  });

  test("generates Brazilian Portuguese metadata", async () => {
    currentLocale = "pt-BR";
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("LibreDB Studio | Editor universal de bancos de dados");
    expect(metadata.description).toBe("Gerencie PostgreSQL, MySQL e SQLite em uma única interface web.");
  });

  test("renders children", async () => {
    const { getByText } = render(await renderLayout(<div>Test Child</div>));
    expect(getByText("Test Child")).not.toBeNull();
  });

  test("renders Toaster without a theme, so it follows next-themes", async () => {
    const { getByTestId } = render(await renderLayout(<span>content</span>));
    const toaster = getByTestId("toaster");
    expect(toaster.getAttribute("data-position")).toBe("bottom-right");
    expect(toaster.getAttribute("data-theme")).toBeNull();
  });

  test("renders html with the resolved locale and font classes via SSR", async () => {
    currentLocale = "pt-BR";
    const portugueseHtml = ReactDOMServer.renderToString(await renderLayout(<span>content</span>));
    expect(portugueseHtml).toContain('lang="pt-BR"');
    expect(portugueseHtml).toContain("mock-geist-sans");
    expect(portugueseHtml).toContain("antialiased");

    currentLocale = "en";
    const englishHtml = ReactDOMServer.renderToString(await renderLayout(<span>content</span>));
    expect(englishHtml).toContain('lang="en"');
  });

  test("body no longer pins the theme with a hardcoded dark class", async () => {
    const element = await renderLayout(React.createElement("span"));
    const bodyClassName = element.props.children.props.className as string;
    expect(bodyClassName.split(" ")).not.toContain("dark");
  });

  test("mounts one global i18n provider around ThemeProvider", async () => {
    const element = await renderLayout(React.createElement("span"));
    const intlProvider = element.props.children.props.children;
    expect(intlProvider.props.locale).toBe("en");
    expect(intlProvider.props.children.type).toBe(ThemeProvider);
  });

  test("renders multiple children correctly", async () => {
    const { getByText } = render(
      await renderLayout(
        <>
          <div>First</div>
          <div>Second</div>
        </>,
      ),
    );
    expect(getByText("First")).not.toBeNull();
    expect(getByText("Second")).not.toBeNull();
  });

  test("suppresses hydration warnings on html and body for extension-mutated attrs", async () => {
    const element = await renderLayout(React.createElement("span"));
    expect(element.props.suppressHydrationWarning).toBe(true);
    expect(element.props.children.props.suppressHydrationWarning).toBe(true);
  });
});
