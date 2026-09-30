/**
 * Structured data for search engines, as a plain script tag: it is data, not
 * code, so `next/script` has nothing to offer it. Every `<` is escaped so a
 * string that happens to contain `</script>` cannot close the tag early; JSON
 * parsers read `<` back as the same character.
 */
export function JsonLd({
  data,
}: {
  readonly data: Readonly<Record<string, unknown>>;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
