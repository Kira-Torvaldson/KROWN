/**
 * Préférences UI terminal (localStorage) — thème, police, curseur, scrollback.
 */
const KEY = 'krown_terminal_prefs'

export type TerminalPrefs = {
  themeBg?: string
  themeFg?: string
  themeCursor?: string
  fontSize?: number
  fontFamily?: string
  cursorBlink?: boolean
  cursorStyle?: 'block' | 'underline' | 'bar'
  scrollback?: number
}

const defaults: Required<TerminalPrefs> = {
  themeBg: '#0f172a',
  themeFg: '#f1f5f9',
  themeCursor: '#3b82f6',
  fontSize: 14,
  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 5000,
}

export function loadTerminalPrefs(): Required<TerminalPrefs> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const p = JSON.parse(raw) as TerminalPrefs
    return {
      themeBg: typeof p.themeBg === 'string' ? p.themeBg : defaults.themeBg,
      themeFg: typeof p.themeFg === 'string' ? p.themeFg : defaults.themeFg,
      themeCursor: typeof p.themeCursor === 'string' ? p.themeCursor : defaults.themeCursor,
      fontSize: typeof p.fontSize === 'number' && p.fontSize >= 8 && p.fontSize <= 32 ? p.fontSize : defaults.fontSize,
      fontFamily: typeof p.fontFamily === 'string' ? p.fontFamily : defaults.fontFamily,
      cursorBlink: typeof p.cursorBlink === 'boolean' ? p.cursorBlink : defaults.cursorBlink,
      cursorStyle:
        p.cursorStyle === 'underline' || p.cursorStyle === 'bar' ? p.cursorStyle : defaults.cursorStyle,
      scrollback:
        typeof p.scrollback === 'number' && p.scrollback >= 100 && p.scrollback <= 50000
          ? p.scrollback
          : defaults.scrollback,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveTerminalPrefs(p: Partial<TerminalPrefs>) {
  try {
    const cur = loadTerminalPrefs()
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...p }))
  } catch {
    /* ignore */
  }
}
