import { describe, expect, it } from "vitest";
import { bringImportUrl } from "./bring";

describe("bringImportUrl", () => {
	it("builds the Bring! deeplink for a public recipe URL with a 1:1 quantity", () => {
		const url = new URL(bringImportUrl("https://mealplan.example.com/api/public/shopping-list/abc?x=1&y=2"));
		expect(url.origin + url.pathname).toBe("https://api.getbring.com/rest/bringrecipes/deeplink");
		expect(url.searchParams.get("url")).toBe("https://mealplan.example.com/api/public/shopping-list/abc?x=1&y=2");
		expect(url.searchParams.get("source")).toBe("web");
		expect(url.searchParams.get("baseQuantity")).toBe("1");
		expect(url.searchParams.get("requestedQuantity")).toBe("1");
	});
});
