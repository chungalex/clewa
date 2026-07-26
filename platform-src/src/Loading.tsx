/** Skeleton screens — pages breathe while data loads instead of flashing blank. */
export default function Loading({ variant = 'page' }: { variant?: 'page' | 'detail' | 'plain' }) {
  if (variant === 'plain') {
    return (
      <div className="skel-wrap" role="status" aria-label="Loading">
        <div className="skel line w60" />
        <div className="skel line w90" />
        <div className="skel line w75" />
      </div>
    )
  }
  return (
    <div className="skel-wrap" role="status" aria-label="Loading">
      <div className="skel title w40" />
      <div className="skel line w60" style={{ marginBottom: 22 }} />
      {variant === 'page' && (
        <div className="kpi-row" style={{ border: 'none' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ padding: '4px 0' }}>
              <div className="skel num w75" />
              <div className="skel line w60" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}
      <div className="skel card" />
      <div className="skel card short" />
    </div>
  )
}
