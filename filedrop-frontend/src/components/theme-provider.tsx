// @ts-nocheck
import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

// Matches the header band (--muted) in each theme; keep in sync with index.html.
const THEME_COLOR = { light: "#e7e6e4", dark: "#212327" } as const

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme
    }
    return defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = () => {
      const resolved = theme === "system" ? (systemDark.matches ? "dark" : "light") : theme
      if (root.classList.contains(resolved)) return

      // A theme flip restyles nearly every element at once; let it snap
      // instead of running every colour transition together.
      const style = document.createElement("style")
      style.textContent = "*,*::before,*::after{transition:none !important}"
      document.head.appendChild(style)

      root.classList.remove("light", "dark")
      root.classList.add(resolved)
      root.style.colorScheme = resolved

      // The browser/status bar tint follows the chosen theme, not just the OS one.
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute("content", THEME_COLOR[resolved]))

      void root.offsetHeight // force a reflow so the swap happens untransitioned
      requestAnimationFrame(() => style.remove())
    }

    apply()
    if (theme !== "system") return

    systemDark.addEventListener("change", apply)
    return () => systemDark.removeEventListener("change", apply)
  }, [theme])

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
