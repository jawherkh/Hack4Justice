/** Wraps the first case-insensitive match of `query` in a <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index === -1) return <>{text}</>
  const end = index + needle.length
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-xs bg-primary/15 text-inherit">{text.slice(index, end)}</mark>
      {text.slice(end)}
    </>
  )
}
