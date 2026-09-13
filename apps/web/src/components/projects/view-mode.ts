export const VIEW_MODES = ['grid', 'list'] as const
export type ViewMode = (typeof VIEW_MODES)[number]
export const DEFAULT_VIEW: ViewMode = 'grid'

const STORAGE_KEY = 'projects:view'

/** Last view the user picked, so it sticks across visits without polluting every URL. */
export function readStoredView(): ViewMode | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'grid' || value === 'list' ? value : null
  } catch {
    return null
  }
}

export function storeView(view: ViewMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Private mode or storage disabled: the URL still carries the choice.
  }
}
