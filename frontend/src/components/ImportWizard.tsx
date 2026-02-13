import { useState, useCallback, useMemo } from 'react'
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadFile, useValidateMapping, useConfirmImport, useCharacteristics } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import type { ImportUploadResponse, ImportValidateResponse, ImportConfirmResponse } from '@/api/client'
import type { Characteristic } from '@/types'

interface ImportWizardProps {
  onClose: () => void
}

type WizardStep = 'upload' | 'map' | 'preview' | 'result'
const STEPS: WizardStep[] = ['upload', 'map', 'preview', 'result']
const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload',
  map: 'Map Columns',
  preview: 'Preview',
  result: 'Result',
}

// Target fields for variable data
const VARIABLE_FIELDS = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'value', label: 'Value' },
  { key: 'batch_number', label: 'Batch' },
  { key: 'operator_id', label: 'Operator' },
] as const

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Try to auto-suggest a mapping based on column header name */
function suggestField(columnName: string): string | null {
  const lower = columnName.toLowerCase().trim()
  if (/^(timestamp|time|date|datetime|date.?time)$/.test(lower)) return 'timestamp'
  if (/^(value|measurement|meas|reading|result|data)$/.test(lower)) return 'value'
  if (/^(batch|batch.?(number|no|id|#)|lot|lot.?(number|no|id))$/.test(lower)) return 'batch_number'
  if (/^(operator|operator.?(id|name)|user|tech|technician)$/.test(lower)) return 'operator_id'
  return null
}

export function ImportWizard({ onClose }: ImportWizardProps) {
  const { selectedPlant } = usePlantContext()
  const [step, setStep] = useState<WizardStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Upload state
  const [uploadResult, setUploadResult] = useState<ImportUploadResponse | null>(null)

  // Mapping state
  const [selectedCharId, setSelectedCharId] = useState<number>(0)
  const [columnMapping, setColumnMapping] = useState<Record<string, number | null>>({})

  // Validation/confirm state
  const [validateResult, setValidateResult] = useState<ImportValidateResponse | null>(null)
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null)

  // API hooks
  const uploadMutation = useUploadFile()
  const validateMutation = useValidateMapping()
  const confirmMutation = useConfirmImport()

  // Load characteristics for the selected plant
  const { data: charData } = useCharacteristics(
    selectedPlant ? { plant_id: selectedPlant.id, per_page: 500 } : undefined,
  )
  const characteristics = charData?.items ?? []

  const selectedChar = useMemo<Characteristic | undefined>(
    () => characteristics.find((c) => c.id === selectedCharId),
    [characteristics, selectedCharId],
  )

  // -- Upload step --

  const handleFileSelect = useCallback(
    async (f: File) => {
      setFile(f)
      try {
        const result = await uploadMutation.mutateAsync(f)
        setUploadResult(result)
        // Auto-suggest mappings
        const mapping: Record<string, number | null> = {}
        for (const field of VARIABLE_FIELDS) {
          mapping[field.key] = null
        }
        for (const col of result.columns) {
          const suggestion = suggestField(col.name)
          if (suggestion && mapping[suggestion] === null) {
            mapping[suggestion] = col.index
          }
        }
        setColumnMapping(mapping)
      } catch {
        // Error handled by mutation's onError
      }
    },
    [uploadMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFileSelect(droppedFile)
    },
    [handleFileSelect],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) handleFileSelect(selected)
    },
    [handleFileSelect],
  )

  // -- Map step --

  const handleMappingChange = (fieldKey: string, colIndex: number | null) => {
    setColumnMapping((prev) => ({ ...prev, [fieldKey]: colIndex }))
  }

  const handleValidate = async () => {
    if (!file || !selectedCharId) return
    try {
      const result = await validateMutation.mutateAsync({
        file,
        characteristicId: selectedCharId,
        columnMapping,
      })
      setValidateResult(result)
      setStep('preview')
    } catch {
      // Error handled by mutation
    }
  }

  // -- Preview step --

  const handleConfirm = async () => {
    if (!file || !selectedCharId) return
    try {
      const result = await confirmMutation.mutateAsync({
        file,
        characteristicId: selectedCharId,
        columnMapping,
      })
      setConfirmResult(result)
      setStep('result')
    } catch {
      // Error handled by mutation
    }
  }

  // -- Navigation --

  const canGoNext = (): boolean => {
    switch (step) {
      case 'upload':
        return !!uploadResult && !uploadMutation.isPending
      case 'map':
        return selectedCharId > 0 && columnMapping.value !== null && !validateMutation.isPending
      case 'preview':
        return !!validateResult && validateResult.valid_count > 0 && !confirmMutation.isPending
      case 'result':
        return false
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Import CSV/Excel</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border shrink-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  i < stepIndex && 'bg-primary/10 text-primary',
                  i === stepIndex && 'bg-primary text-primary-foreground',
                  i > stepIndex && 'bg-muted text-muted-foreground',
                )}
              >
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-current/10">
                  {i < stepIndex ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className={cn(i === stepIndex ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      {i + 1}
                    </span>
                  )}
                </span>
                {STEP_LABELS[s]}
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <UploadStep
              file={file}
              uploadResult={uploadResult}
              isPending={uploadMutation.isPending}
              dragOver={dragOver}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onFileInput={handleFileInput}
            />
          )}

          {step === 'map' && uploadResult && (
            <MapStep
              columns={uploadResult.columns}
              characteristics={characteristics}
              selectedCharId={selectedCharId}
              onCharSelect={setSelectedCharId}
              columnMapping={columnMapping}
              onMappingChange={handleMappingChange}
              selectedChar={selectedChar}
            />
          )}

          {step === 'preview' && validateResult && (
            <PreviewStep result={validateResult} />
          )}

          {step === 'result' && confirmResult && (
            <ResultStep result={confirmResult} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div>
            {stepIndex > 0 && step !== 'result' && (
              <button
                onClick={() => setStep(STEPS[stepIndex - 1])}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'result' ? (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                {step === 'upload' && (
                  <button
                    onClick={() => setStep('map')}
                    disabled={!canGoNext()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {step === 'map' && (
                  <button
                    onClick={handleValidate}
                    disabled={!canGoNext()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {validateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Validate
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
                {step === 'preview' && (
                  <button
                    onClick={handleConfirm}
                    disabled={!canGoNext()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Import {validateResult?.valid_count ?? 0} Samples
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step Components ──

function UploadStep({
  file,
  uploadResult,
  isPending,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInput,
}: {
  file: File | null
  uploadResult: ImportUploadResponse | null
  isPending: boolean
  dragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
        )}
      >
        {isPending ? (
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium">
            {isPending ? 'Parsing file...' : 'Drag & drop a CSV or Excel file here'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
        </div>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFileInput}
          className="hidden"
        />
      </label>

      {/* File info */}
      {file && uploadResult && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{uploadResult.row_count} rows</span>
            <span>{uploadResult.columns.length} columns</span>
          </div>
          {/* Preview first few rows */}
          {uploadResult.preview_rows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    {uploadResult.columns.map((col) => (
                      <th
                        key={col.index}
                        className="text-left px-2 py-1 border-b border-border font-medium text-muted-foreground"
                      >
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.preview_rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1 truncate max-w-32">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MapStep({
  columns,
  characteristics,
  selectedCharId,
  onCharSelect,
  columnMapping,
  onMappingChange,
  selectedChar,
}: {
  columns: ImportUploadResponse['columns']
  characteristics: Characteristic[]
  selectedCharId: number
  onCharSelect: (id: number) => void
  columnMapping: Record<string, number | null>
  onMappingChange: (field: string, colIndex: number | null) => void
  selectedChar: Characteristic | undefined
}) {
  return (
    <div className="space-y-5">
      {/* Characteristic picker */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Target Characteristic</label>
        <select
          value={selectedCharId}
          onChange={(e) => onCharSelect(Number(e.target.value))}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value={0}>Select a characteristic...</option>
          {characteristics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (subgroup: {c.subgroup_size})
            </option>
          ))}
        </select>
        {selectedChar && (
          <p className="text-xs text-muted-foreground mt-1">
            Subgroup size: {selectedChar.subgroup_size}
            {selectedChar.unit ? ` | Unit: ${selectedChar.unit}` : ''}
          </p>
        )}
      </div>

      {/* Column mapping table */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Column Mapping</label>
        <p className="text-xs text-muted-foreground mb-3">
          Map file columns to data fields. "Value" is required.
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Target Field</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">File Column</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sample Values</th>
              </tr>
            </thead>
            <tbody>
              {VARIABLE_FIELDS.map((field) => {
                const mappedColIndex = columnMapping[field.key]
                const mappedCol = mappedColIndex !== null && mappedColIndex !== undefined
                  ? columns.find((c) => c.index === mappedColIndex)
                  : null
                return (
                  <tr key={field.key} className="border-t border-border/50">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{field.label}</span>
                      {field.key === 'value' && (
                        <span className="ml-1 text-xs text-destructive">*</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={mappedColIndex ?? ''}
                        onChange={(e) =>
                          onMappingChange(
                            field.key,
                            e.target.value === '' ? null : Number(e.target.value),
                          )
                        }
                        className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">-- None --</option>
                        {columns.map((col) => (
                          <option key={col.index} value={col.index}>
                            {col.name} ({col.detected_type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {mappedCol
                        ? mappedCol.sample_values.slice(0, 3).join(', ')
                        : '--'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PreviewStep({ result }: { result: ImportValidateResponse }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-4">
        <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg px-4 py-3 flex-1 text-center">
          <div className="text-2xl font-bold">{result.valid_count}</div>
          <div className="text-xs">Valid Rows</div>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 flex-1 text-center">
          <div className="text-2xl font-bold">{result.total_rows}</div>
          <div className="text-xs text-muted-foreground">Total Rows</div>
        </div>
        {result.error_rows.length > 0 && (
          <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 flex-1 text-center">
            <div className="text-2xl font-bold">{result.error_rows.length}</div>
            <div className="text-xs">Errors</div>
          </div>
        )}
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Error rows */}
      {result.error_rows.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Error Details</h4>
          <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-16">Row</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.error_rows.map((err) => (
                  <tr key={err.row} className="border-t border-border/50 text-destructive">
                    <td className="px-3 py-1.5">{err.row}</td>
                    <td className="px-3 py-1.5">{err.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Valid rows preview */}
      {result.valid_rows.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Preview (first 20 valid rows)</h4>
          <div className="border border-border rounded-lg overflow-hidden overflow-x-auto max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Measurements</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Timestamp</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Batch</th>
                </tr>
              </thead>
              <tbody>
                {result.valid_rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono">{row.measurements.join(', ')}</td>
                    <td className="px-3 py-1.5">{row.timestamp ?? '--'}</td>
                    <td className="px-3 py-1.5">{row.batch_number ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultStep({ result }: { result: ImportConfirmResponse }) {
  const success = result.imported > 0
  return (
    <div className="flex flex-col items-center py-6 space-y-4">
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center',
          success ? 'bg-emerald-500/10' : 'bg-destructive/10',
        )}
      >
        {success ? (
          <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <X className="h-8 w-8 text-destructive" />
        )}
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold">
          {success ? 'Import Complete' : 'Import Failed'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {result.imported} of {result.total_rows} samples imported successfully
          {result.errors > 0 && ` (${result.errors} errors)`}
        </p>
      </div>

      {result.error_details.length > 0 && (
        <div className="w-full border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-16">Row</th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Error</th>
              </tr>
            </thead>
            <tbody>
              {result.error_details.map((err) => (
                <tr key={err.row} className="border-t border-border/50 text-destructive">
                  <td className="px-3 py-1.5">{err.row}</td>
                  <td className="px-3 py-1.5">{err.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
