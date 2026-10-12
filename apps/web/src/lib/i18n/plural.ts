const rules = new Map<string, Intl.PluralRules>();

/** Pick a plural form for `n` in `locale`. `other` is required; every other form falls back to it. */
export function plural(locale: string, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)));
  return forms[r.select(n)] ?? forms.other;
}
