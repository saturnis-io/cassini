import { useEffect, useRef } from 'react'

/**
 * Listens for a keyboard sequence (like a Konami code) and fires a callback
 * when completed. Tolerates other keypresses between sequence keys — only
 * tracks whether the required keys have been hit in order.
 *
 * @param sequence - Array of key values to match (case-insensitive)
 * @param callback - Fired once when the full sequence is detected
 */
export function useKonamiSequence(sequence: string[], callback: () => void) {
  const indexRef = useRef(0)

  useEffect(() => {
    const lowerSequence = sequence.map((k) => k.toLowerCase())

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      if (key === lowerSequence[indexRef.current]) {
        indexRef.current += 1

        if (indexRef.current === lowerSequence.length) {
          indexRef.current = 0
          callback()
        }
      }
      // Non-matching keys are simply ignored — sequence position is preserved
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [sequence, callback])
}
