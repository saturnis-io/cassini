import { useState, useRef, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useFAICharacteristicSearch } from '@/api/hooks'
import type { FAICharacteristicSearchResult } from '@/api/client'

export function CharacteristicSearch({
  plantId,
  onSelect,
}: {
  plantId: number
  onSelect: (result: FAICharacteristicSearchResult) => void
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const { data: results, isFetching } = useFAICharacteristicSearch(
    debouncedQuery,
    plantId,
  )

  // Debounce the search query
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (result: FAICharacteristicSearchResult) => {
    onSelect(result)
    setQuery('')
    setDebouncedQuery('')
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(e.target.value.length > 0)
          }}
          onFocus={() => {
            if (query.length > 0) setIsOpen(true)
          }}
          className="bg-background border-border focus:ring-primary/50 w-full rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
          placeholder="Search SPC characteristic..."
        />
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      </div>

      {isOpen && results && results.length > 0 && (
        <div className="bg-popover border-border absolute top-full z-50 mt-1 max-h-60 w-80 overflow-y-auto rounded-lg border shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="hover:bg-muted/50 flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
            >
              <span className="text-sm font-medium">{r.name}</span>
              <span className="text-muted-foreground text-xs">{r.hierarchy_path}</span>
              <span className="text-muted-foreground text-xs">
                {r.nominal != null && `Nom: ${r.nominal}`}
                {r.usl != null && ` | USL: ${r.usl}`}
                {r.lsl != null && ` | LSL: ${r.lsl}`}
                {r.unit && ` | ${r.unit}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {isOpen && debouncedQuery.length > 0 && results && results.length === 0 && !isFetching && (
        <div className="bg-popover border-border absolute top-full z-50 mt-1 w-80 rounded-lg border px-3 py-2 shadow-lg">
          <span className="text-muted-foreground text-sm">No characteristics found</span>
        </div>
      )}
    </div>
  )
}
