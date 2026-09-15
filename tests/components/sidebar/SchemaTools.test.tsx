import "../../setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "../../helpers/render-with-intl";
import { SchemaTools } from "@/components/sidebar/SchemaTools";

afterEach(cleanup);

describe("SchemaTools", () => {
  for (const locale of ["en", "pt-BR"] as const) {
    const trigger = locale === "en" ? "Schema tools" : "Ferramentas do schema";
    const labels = locale === "en"
      ? ["ERD diagram", "Database documentation", "Compare schemas"]
      : ["Diagrama ERD", "Documentação do banco", "Comparar schemas"];
    for (const [index, callback] of ["onShowDiagram", "onShowDocs", "onCompareSchemas"].entries()) {
      test(`${locale}: ${callback} opens through the schema menu`, async () => {
        const action = mock(() => {});
        const { getByRole } = render(<SchemaTools {...{ [callback]: action }} />, locale);
        await userEvent.click(getByRole("button", { name: trigger }));
        await userEvent.click(getByRole("menuitem", { name: labels[index] }));
        expect(action).toHaveBeenCalledTimes(1);
      });
    }
  }

  test("does not offer unavailable actions", async () => {
    const { getByRole, queryByRole } = render(<SchemaTools onShowDocs={() => {}} />);
    await userEvent.click(getByRole("button", { name: "Schema tools" }));
    expect(queryByRole("menuitem", { name: "ERD diagram" })).toBeNull();
    expect(queryByRole("menuitem", { name: "Compare schemas" })).toBeNull();
  });

  test("renders nothing without actions", () => {
    const { queryByRole } = render(<SchemaTools />);
    expect(queryByRole("button")).toBeNull();
  });

  test("opens and activates an action using the keyboard", async () => {
    const action = mock(() => {});
    const user = userEvent.setup();
    const { getByRole } = render(<SchemaTools onShowDiagram={action} />);
    getByRole("button", { name: "Schema tools" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
  });
});
