export function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <p>
      {label}: <code className="rounded bg-background px-2 py-0.5 text-xs">{path}</code>
    </p>
  )
}
