import { m as escape_html } from "../../../../chunks/server.js";
//#region src/lib/i18n/plural.ts
var rules = /* @__PURE__ */ new Map();
/** Pick a plural form for `n` in `locale`. `other` is required; every other form falls back to it. */
function plural(locale, n, forms) {
	let r = rules.get(locale);
	if (!r) rules.set(locale, r = new Intl.PluralRules(locale));
	return forms[r.select(n)] ?? forms.other;
}
//#endregion
//#region src/lib/i18n/index.ts
/** The active catalogue. Finnish arrives in M7; until then this is always English. */
var m = {
	app: {
		name: "Concord",
		backendVersion: (version) => `Stoat ${version}`,
		unreachable: "unreachable"
	},
	common: { members: (n) => plural("en", n, {
		one: `${n} member`,
		other: `${n} members`
	}) }
};
//#endregion
//#region src/routes/(app)/app/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		$$renderer.push(`<main><h1>${escape_html(m.app.name)}</h1> <p>${escape_html(m.app.backendVersion("…"))}</p></main>`);
	});
}
//#endregion
export { _page as default };
