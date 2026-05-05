import { useEffect, useRef, useState } from 'react'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import { useValidateCep } from '@/api/hooks/cep'
import { useTheme } from '@/providers/ThemeProvider'
import type { CepValidationError } from '@/api/cep.api'

const _DEFAULT_TEMPLATE = `# CEP rule — multi-stream pattern that fires a violation when every
# condition has matched at least once inside the sliding window.

name: my-rule
description: Describe the production scenario this guards against
window: 30s
conditions:
  - characteristic: Plant > Line > Station > Char
    rule: above_mean_consecutive
    count: 3
  - characteristic: Plant > Line > Other Station > Char
    rule: below_mean_consecutive
    count: 3
action:
  violation: STABLE_VIOLATION_CODE
  severity: high
  message: Operator-facing description shown on the violation
`

interface CepRuleEditorProps {
  value: string
  onChange: (next: string) => void
  height?: number | string
  /** When true, the editor is read-only — used in detail view. */
  readOnly?: boolean
}

/**
 * Monaco-powered YAML editor for CEP rules.
 *
 * Uses the existing fetchApi-backed validation endpoint so the editor
 * surfaces server-side schema errors directly as inline markers.
 * Validation runs after the user pauses typing for 500ms — short
 * enough to feel live, long enough to avoid hammering the API on every
 * keystroke.
 */
export function CepRuleEditor({
  value,
  onChange,
  height = 480,
  readOnly = false,
}: CepRuleEditorProps) {
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const validate = useValidateCep()
  const [errors, setErrors] = useState<CepValidationError[]>([])
  // Resolve Monaco's color theme from the app's theme so light-mode users
  // do not get a dark editor pane mid-page.
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'

  // Debounced server-side validation — re-fired on each value change.
  useEffect(() => {
    if (!value.trim()) {
      setErrors([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const result = await validate.mutateAsync(value)
        setErrors(result.errors ?? [])
      } catch {
        // Network errors are surfaced via the mutation's toast; we keep
        // the previous markers in place so users can continue editing.
      }
    }, 500)
    return () => clearTimeout(timer)
    // validate.mutateAsync is stable — listening to it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Sync the validation errors into Monaco markers.
  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return
    const model = editor.getModel()
    if (!model) return
    const markers = errors.map((err) => ({
      severity: monaco.MarkerSeverity.Error,
      message: err.message,
      startLineNumber: err.line,
      startColumn: err.column,
      endLineNumber: err.line,
      endColumn: err.column + 1,
    }))
    monaco.editor.setModelMarkers(model, 'cep-rule', markers)
  }, [errors])

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    monaco.languages.setLanguageConfiguration('yaml', {
      comments: { lineComment: '#' },
      brackets: [
        ['[', ']'],
        ['{', '}'],
      ],
      autoClosingPairs: [
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    })
  }

  return (
    <div className="border-border flex flex-col overflow-hidden rounded-md border">
      <Editor
        height={height}
        defaultLanguage="yaml"
        theme={monacoTheme}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={onMount}
        loading={
          // Monaco's bundle is ~2-3MB; show a textarea-shaped skeleton on
          // first paint so the layout does not collapse while it loads.
          <div
            data-ui="cep-editor-skeleton"
            className="bg-muted/40 flex h-full w-full animate-pulse flex-col gap-2 p-3"
          >
            <div className="bg-muted h-3 w-1/3 rounded" />
            <div className="bg-muted h-3 w-2/3 rounded" />
            <div className="bg-muted h-3 w-1/2 rounded" />
            <div className="bg-muted h-3 w-3/4 rounded" />
            <div className="bg-muted h-3 w-2/5 rounded" />
          </div>
        }
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
      {errors.length > 0 && (
        <div
          data-ui="cep-editor-errors"
          className="border-border bg-card text-destructive max-h-32 overflow-y-auto border-t px-3 py-2 text-xs"
        >
          {errors.map((err, idx) => (
            <div key={idx} className="font-mono">
              line {err.line}: {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const DEFAULT_CEP_RULE_TEMPLATE = _DEFAULT_TEMPLATE
