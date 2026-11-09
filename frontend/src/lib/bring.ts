const BRING_DEEPLINK = "https://api.getbring.com/rest/bringrecipes/deeplink";

/**
 * Bring! imports a "recipe" from a public URL (schema.org Recipe markup). Quantities are passed
 * 1:1 so Bring! does not rescale the counts already in the list.
 */
export function bringImportUrl(recipeUrl: string): string {
	const params = new URLSearchParams({
		url: recipeUrl,
		source: "web",
		baseQuantity: "1",
		requestedQuantity: "1",
	});
	return `${BRING_DEEPLINK}?${params.toString()}`;
}
