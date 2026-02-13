import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { Globe } from 'lucide-react'

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  // Add more languages here as translations are added:
  // { code: 'de', label: 'Deutsch' },
  // { code: 'es', label: 'Espanol' },
  // { code: 'fr', label: 'Francais' },
  // { code: 'ja', label: 'Japanese' },
  // { code: 'zh', label: 'Chinese' },
]

/**
 * Language selector dropdown.
 * Changes the i18n language and persists the selection to the UI store.
 * Currently only English is available, but the framework supports adding more.
 */
export function LanguageSelector() {
  const { i18n } = useTranslation()
  const { language, setLanguage } = useUIStore()

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang)
    setLanguage(lang)
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="text-muted-foreground h-4 w-4" />
      <select
        value={language}
        onChange={(e) => handleChange(e.target.value)}
        className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
      >
        {AVAILABLE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  )
}
