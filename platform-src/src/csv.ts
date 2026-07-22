/** "Excel export everywhere" — one honest CSV helper for every page. */
function esc(v: string | number | null | undefined) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const body = [header.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([body], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
