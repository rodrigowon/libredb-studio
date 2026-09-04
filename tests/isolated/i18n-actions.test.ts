import { beforeEach, describe, expect, mock, test } from "bun:test";

const cookieSet = mock(() => {});

mock.module("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

const { setLocale } = await import("@/i18n/actions");

describe("setLocale", () => {
  beforeEach(() => {
    cookieSet.mockClear();
  });

  test("persists a supported locale for one year", async () => {
    await setLocale("en");
    expect(cookieSet).toHaveBeenCalledWith("libredb_locale", "en", {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  });

  test("rejects an invalid locale without writing a cookie", async () => {
    await expect(setLocale("es")).rejects.toThrow("Unsupported locale: es");
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
