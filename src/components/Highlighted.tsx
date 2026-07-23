/** Render `text` with the first case-insensitive `query` match emphasized in
 *  the accent color. Shared by the @ picker and the Variables side panel. */
export function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'transparent', color: 'var(--color-primary)', fontWeight: 700 }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}
