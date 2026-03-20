import { useState, useCallback, useMemo } from 'react'
import { z } from 'zod'
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { CharacteristicPicker } from '@/components/CharacteristicPicker'
import { inputErrorClass } from '@/lib/validation'
import {
  useUploadFile,
  useValidateMapping,
  useConfirmImport,
  useCharacteristics,
} from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import type {
  ImportUploadResponse,
  ImportValidateResponse,
  ImportConfirmResponse,
} from '@/api/client'
import type { Characteristic } from '@/types'

const columnMappingSchema = z.object({
  characteristicId: z.number().int().positive('Target characteristic is required'),
  value: z.number({ error: 'Value column mapping is required' }).int().min(0, 'Value column mapping is required'),
})

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

  // Column mapping validation
  const { validate: validateMapping, getError: getMappingError, clearErrors: clearMappingErrors } = useFormValidation(columnMappingSchema)

  // Load characteristics for the selected plant
  const { data: charData } = useCharacteristics(
    selectedPlant ? { plant_id: selectedPlant.id, per_page: 500 } : undefined,
  )
  const characteristics = useMemo(() => charData?.items ?? [], [charData?.items])

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
    const validated = validateMapping({
      characteristicId: selectedCharId,
      value: columnMapping.value,
    })
    if (!validated) return
    if (!file) return
    clearMappingErrors()
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
      <div className="bg-card border-border relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">Import CSV/Excel</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="border-border flex shrink-0 items-center gap-1 border-b px-6 py-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  i < stepIndex && 'bg-primary/10 text-primary',
                  i === stepIndex && 'bg-primary text-primary-foreground',
                  i > stepIndex && 'bg-muted text-muted-foreground',
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold">
                  {i < stepIndex ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span
                      className={cn(
                        i === stepIndex ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                </span>
                {STEP_LABELS[s]}
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="text-muted-foreground mx-1 h-3 w-3" />
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
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onFileInput={handleFileInput}
            />
          )}

          {step === 'map' && uploadResult && (
            <MapStep
              plantId={selectedPlant?.id ?? 0}
              columns={uploadResult.columns}
              characteristics={characteristics}
              selectedCharId={selectedCharId}
              onCharSelect={setSelectedCharId}
              columnMapping={columnMapping}
              onMappingChange={handleMappingChange}
              selectedChar={selectedChar}
              getMappingError={getMappingError}
            />
          )}

          {step === 'preview' && validateResult && <PreviewStep result={validateResult} />}

          {step === 'result' && confirmResult && <ResultStep result={confirmResult} />}
        </div>

        {/* Footer */}
        <div className="border-border flex shrink-0 items-center justify-between border-t px-6 py-4">
          <div>
            {stepIndex > 0 && step !== 'result' && (
              <button
                onClick={() => setStep(STEPS[stepIndex - 1])}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
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
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                {step === 'upload' && (
                  <button
                    onClick={() => setStep('map')}
                    disabled={!canGoNext()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {step === 'map' && (
                  <button
                    onClick={handleValidate}
                    disabled={!canGoNext()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
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
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
        )}
      >
        {isPending ? (
          <Loader2 className="text-primary h-10 w-10 animate-spin" />
        ) : (
          <Upload className="text-muted-foreground h-10 w-10" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium">
            {isPending ? 'Parsing file...' : 'Drag & drop a CSV or Excel file here'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">or click to browse</p>
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFileInput} className="hidden" />
      </label>

      {/* File info */}
      {file && uploadResult && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="text-primary h-4 w-4" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-muted-foreground text-xs">({formatFileSize(file.size)})</span>
          </div>
          <div className="text-muted-foreground flex gap-4 text-xs">
            <span>{uploadResult.row_count} rows</span>
            <span>{uploadResult.columns.length} columns</span>
          </div>
          {/* Preview first few rows */}
          {uploadResult.preview_rows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {uploadResult.columns.map((col) => (
                      <th
                        key={col.index}
                        className="border-border text-muted-foreground border-b px-2 py-1 text-left font-medium"
                      >
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.preview_rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-border/50 border-b">
                      {row.map((cell, j) => (
                        <td key={j} className="max-w-32 truncate px-2 py-1">
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
  plantId,
  columns,
  characteristics,
  selectedCharId,
  onCharSelect,
  columnMapping,
  onMappingChange,
  selectedChar,
  getMappingError,
}: {
  plantId: number
  columns: ImportUploadResponse['columns']
  characteristics: Characteristic[]
  selectedCharId: number
  onCharSelect: (id: number) => void
  columnMapping: Record<string, number | null>
  onMappingChange: (field: string, colIndex: number | null) => void
  selectedChar: Characteristic | undefined
  getMappingError: (field: string) => string | undefined
}) {
  return (
    <div className="space-y-5">
      {/* Characteristic picker */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Target Characteristic</label>
        <CharacteristicPicker
          plantId={plantId}
          value={selectedCharId || null}
          onChange={(id) => onCharSelect(id ?? 0)}
          characteristics={characteristics}
        />
        <FieldError error={getMappingError('characteristicId')} />
        {selectedChar && (
          <p className="text-muted-foreground mt-1 text-xs">
            Subgroup size: {selectedChar.subgroup_size}
            {selectedChar.unit ? ` | Unit: ${selectedChar.unit}` : ''}
          </p>
        )}
      </div>

      {/* Column mapping table */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Column Mapping</label>
        <p className="text-muted-foreground mb-3 text-xs">
          Map file columns to data fields. "Value" is required.
        </p>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-muted-foreground px-3 py-2 text-left font-medium">
                  Target Field
                </th>
                <th className="text-muted-foreground px-3 py-2 text-left font-medium">
                  File Column
                </th>
                <th className="text-muted-foreground px-3 py-2 text-left font-medium">
                  Sample Values
                </th>
              </tr>
            </thead>
            <tbody>
              {VARIABLE_FIELDS.map((field) => {
                const mappedColIndex = columnMapping[field.key]
                const mappedCol =
                  mappedColIndex !== null && mappedColIndex !== undefined
                    ? columns.find((c) => c.index === mappedColIndex)
                    : null
                return (
                  <tr key={field.key} className="border-border/50 border-t">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{field.label}</span>
                      {field.key === 'value' && (
                        <span className="text-destructive ml-1 text-xs">*</span>
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
                        className={cn(
                          'bg-background border-border focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none',
                          field.key === 'value' && inputErrorClass(getMappingError('value')),
                        )}
                      >
                        <option value="">-- None --</option>
                        {columns.map((col) => (
                          <option key={col.index} value={col.index}>
                            {col.name} ({col.detected_type})
                          </option>
                        ))}
                      </select>
                      {field.key === 'value' && <FieldError error={getMappingError('value')} />}
                    </td>
                    <td className="text-muted-foreground px-3 py-2.5 text-xs">
                      {mappedCol ? mappedCol.sample_values.slice(0, 3).join(', ') : '--'}
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
        <div className="bg-success/10 text-success flex-1 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold">{result.valid_count}</div>
          <div className="text-xs">Valid Rows</div>
        </div>
        <div className="bg-muted flex-1 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold">{result.total_rows}</div>
          <div className="text-muted-foreground text-xs">Total Rows</div>
        </div>
        {result.error_rows.length > 0 && (
          <div className="bg-destructive/10 text-destructive flex-1 rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold">{result.error_rows.length}</div>
            <div className="text-xs">Errors</div>
          </div>
        )}
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="border-warning/20 bg-warning/10 space-y-1 rounded-lg border p-3">
          {result.warnings.map((w, i) => (
            <div key={i} className="text-warning flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Error rows */}
      {result.error_rows.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Error Details</h4>
          <div className="border-border max-h-40 overflow-hidden overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-muted-foreground w-16 px-3 py-1.5 text-left font-medium">
                    Row
                  </th>
                  <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.error_rows.map((err) => (
                  <tr key={err.row} className="border-border/50 text-destructive border-t">
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
          <h4 className="mb-2 text-sm font-medium">Preview (first 20 valid rows)</h4>
          <div className="border-border max-h-52 overflow-hidden overflow-x-auto overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">#</th>
                  <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">
                    Measurements
                  </th>
                  <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">
                    Timestamp
                  </th>
                  <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">Batch</th>
                </tr>
              </thead>
              <tbody>
                {result.valid_rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-border/50 border-t">
                    <td className="text-muted-foreground px-3 py-1.5">{i + 1}</td>
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
    <div className="flex flex-col items-center space-y-4 py-6">
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full',
          success ? 'bg-success/10' : 'bg-destructive/10',
        )}
      >
        {success ? (
          <Check className="text-success h-8 w-8" />
        ) : (
          <X className="text-destructive h-8 w-8" />
        )}
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold">{success ? 'Import Complete' : 'Import Failed'}</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {result.imported} of {result.total_rows} samples imported successfully
          {result.errors > 0 && ` (${result.errors} errors)`}
        </p>
      </div>

      {result.error_details.length > 0 && (
        <div className="border-border max-h-40 w-full overflow-hidden overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-muted-foreground w-16 px-3 py-1.5 text-left font-medium">
                  Row
                </th>
                <th className="text-muted-foreground px-3 py-1.5 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {result.error_details.map((err) => (
                <tr key={err.row} className="border-border/50 text-destructive border-t">
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
