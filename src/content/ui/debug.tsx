import { render, h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { getAll, subscribe, clear, type LogEvent } from '../log/buffer'
import { getString, Keys } from '../store/local'
import { getSeekableEnd, getSeekableStart, GUARD_SEC } from '../core/seek'
import { getCalibration } from '../core/calibration'

type GetVideo = () => HTMLVideoElement | null

export type DebugAPI = { open: () => void; close: () => void; toggle: () => void; isOpen: () => boolean }

export function mountDebug(sr: ShadowRoot, getVideo: GetVideo): DebugAPI {
  const hostId = 'yt-longseek-debug-root'
  let host = sr.getElementById(hostId)
  if (!host) {
    host = document.createElement('div')
    host.id = hostId
    sr.appendChild(host)
  }

  let api: DebugAPI = { open: () => {}, close: () => {}, toggle: () => {}, isOpen: () => false }

  function App() {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const [events, setEvents] = useState<LogEvent[]>(() => getAll())
    const contRef = useRef<HTMLDivElement>(null)

    // subscribe buffer
    useEffect(() => {
      const off = subscribe(() => setEvents(getAll()))
      return off
    }, [])

    // API exposure
    useEffect(() => {
      api.open = () => setOpen(true)
      api.close = () => setOpen(false)
      api.toggle = () => setOpen(v => !v)
      api.isOpen = () => open
    }, [open])

    const filtered = useMemo(() => {
      const q = filter.trim().toLowerCase()
      if (!q) return events
      return events.filter(e => JSON.stringify(e).toLowerCase().includes(q))
    }, [events, filter])

    function copySnapshot() {
      const v = getVideo()
      const start = v ? getSeekableStart(v) : 0
      const end = v ? getSeekableEnd(v) : 0
      const endGuard = Math.max(start, end - GUARD_SEC)
      const cur = v ? safe(() => v!.currentTime, 0) : 0
      const tz = getString(Keys.TzCurrent)
      const cal = safe(getCalibration, null)
      const last = events[events.length - 1] ?? null
      const snap = {
        ts: new Date().toISOString(),
        tz,
        seekable: { start, end, endGuard },
        currentTime: cur,
        calibration: cal,
        lastEvent: last,
        recent: events.slice(-10),
      }
      const text = JSON.stringify(snap, null, 2)
      navigator.clipboard.writeText(text).catch(() => {})
    }

    const display = open ? '' : 'none'
    return (
      <div id="yt-debug" style={{
        position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
        width: '440px', maxHeight: '60vh', background: 'rgba(17,17,17,.96)', color: '#fff',
        border: '1px solid rgba(255,255,255,.1)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        display,
      }}>
        <style>{`
          #yt-debug * { box-sizing: border-box; font: 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif }
          #yt-debug .top { display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid rgba(255,255,255,.08) }
          #yt-debug .top .sp { flex:1 1 auto }
          #yt-debug .top input { width: 220px; padding:4px 6px; border:1px solid #444; border-radius:6px; background:#0f0f0f; color:#fff }
          #yt-debug .btn { background:#212121; color:#ddd; border:1px solid #444; border-radius:6px; padding:4px 8px; cursor:pointer }
          #yt-debug .btn:hover { background:#2a2a2a }
          #yt-debug .body { display:flex; gap:10px; padding:8px }
          #yt-debug .col { flex:1 1 50% }
          #yt-debug .list { height: 44vh; overflow:auto; border:1px solid #333; border-radius:6px; background:#111 }
          #yt-debug .item { padding:6px 8px; border-bottom:1px solid #222 }
          #yt-debug .item .k { color:#9ca3af }
          #yt-debug .item .t { color:#a78bfa }
          #yt-debug pre { margin:0; white-space:pre-wrap; word-break:break-word }
        `}</style>
        <div class="top">
          <strong>Debug Panel</strong>
          <span class="sp" />
          <input value={filter} onInput={(e: any) => setFilter(e.currentTarget.value)} placeholder="Search..." />
          <button class="btn" title="Copy debug snapshot" onClick={copySnapshot}>Copy</button>
          <button class="btn" title="Clear logs" onClick={() => clear()}>Clear</button>
          <button class="btn" title="Close" onClick={() => setOpen(false)}>×</button>
        </div>
        <div class="body">
          <div class="col">
            <Section title="Now">
              {renderNow(getVideo)}
            </Section>
            <Section title="Calibration">
              {renderCal()}
            </Section>
          </div>
          <div class="col">
            <div class="list" ref={contRef}>
              {filtered.length === 0 && <div class="item">No events</div>}
              {filtered.map((e) => (
                <div class="item">
                  <div><span class="t">{fmtTs(e.ts)}</span> <span class="k">[{e.kind}]</span></div>
                  {e.data != null && <pre>{safeStringify(e.data)}</pre>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  render(h(App, {}), host)
  return api
}

function Section(props: { title: string; children: any }) {
  return (
    <div style="margin-bottom:8px">
      <div style="color:#9ca3af;margin-bottom:4px">{props.title}</div>
      <div style="border:1px solid #333;border-radius:6px;padding:6px;background:#111">{props.children}</div>
    </div>
  )
}

function renderNow(getVideo: GetVideo) {
  const v = getVideo()
  const tz = getString(Keys.TzCurrent) || '—'
  const start = v ? getSeekableStart(v) : 0
  const end = v ? getSeekableEnd(v) : 0
  const endGuard = Math.max(start, end - GUARD_SEC)
  const cur = v ? safe(() => v!.currentTime, 0) : 0
  return (
    <div>
      <div>TZ: {tz}</div>
      <div>Seekable: start={start.toFixed(2)} end={end.toFixed(2)} endGuard={endGuard.toFixed(2)}</div>
      <div>currentTime: {cur.toFixed(2)}</div>
    </div>
  )
}

function renderCal() {
  const cal = safe(getCalibration, null) as any
  if (!cal) return <div>—</div>
  return (
    <div>
      <div>status: {cal.status}</div>
      <div>C: {cal.C != null ? cal.C.toFixed(2) : '—'} MAD: {cal.mad != null ? cal.mad.toFixed(2) : '—'} samples: {cal.samples}</div>
      <div>quality: {cal.quality}</div>
    </div>
  )
}

function fmtTs(ms: number): string {
  try { return new Date(ms).toISOString().split('T')[1]!.replace('Z','Z') } catch { return String(ms) }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

