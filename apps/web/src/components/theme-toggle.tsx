import * as React from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@hack4justice/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import { useTranslation, type MessageKey } from '#/i18n'

const OPTIONS: { value: 'light' | 'dark' | 'system'; icon: typeof Sun; label: MessageKey }[] = [
  { value: 'light', icon: Sun, label: 'theme.light' },
  { value: 'dark', icon: Moon, label: 'theme.dark' },
  { value: 'system', icon: Monitor, label: 'theme.system' },
]

/** Light / dark / system menu. The trigger icon follows the resolved theme once mounted. */
export function ThemeToggle() {
  const t = useTranslation()
  const { theme, resolvedTheme, setTheme } = useTheme()
  // Theme is unknown during SSR; render a neutral icon until the client knows.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const Icon = !mounted ? Sun : resolvedTheme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('theme.label')} />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {OPTIONS.map(({ value, icon: OptionIcon, label }) => (
            <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
              <OptionIcon />
              {t(label)}
              {mounted && theme === value ? <Check className="ms-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
