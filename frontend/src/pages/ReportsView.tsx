import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { REPORT_TEMPLATES } from '@/lib/report-templates'
import type { ReportTemplate } from '@/lib/report-templates'
import { ReportPreview } from '@/components/ReportPreview'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ExportDropdown } from '@/components/ExportDropdown'
import { CharacteristicContextBar } from '@/components/CharacteristicContextBar'
import { NoCharacteristicState } from '@/components/NoCharacteristicState'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartData, useViolations, useCharacteristic, useAnnotations, useCapability, useDOEStudies, useMSAStudies, usePlantHealth, useDOEStudy, useDOEAnalysis, useMSAStudy, useMSAResults, useCharacteristics } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import { useLicense } from '@/hooks/useLicense'
import { exportBatchReportsToZip } from '@/lib/export-utils'
import { characteristicApi } from '@/api/characteristics.api'
import { capabilityApi } from '@/api/quality.api'
import { useDateFormat } from '@/hooks/useDateFormat'
import { toast } from 'sonner'
import { FileText, Lock, PackageCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null)
  const [selectedLinePath, setSelectedLinePath] = useState<string | null>(null)
  const selectedCharId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedCharId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const reportContentRef = useRef<HTMLDivElement>(null)
  const { isProOrAbove } = useLicense()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0
  const { datetimeFormat } = useDateFormat()

  // ── Batch export state ──────────────────────────────────────────────
  const [batchMode, setBatchMode] = useState(false)
  const [selectedCharIds, setSelectedCharIds] = useState<Set<number>>(new Set())
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)

  // Fetch all characteristics for batch selection (only when batch mode is active)
  const { data: allCharacteristics } = useCharacteristics(
    { plant_id: plantId, per_page: 500 },
    { refetchInterval: false },
  )

  const toggleCharSelection = useCallback((charId: number) => {
    setSelectedCharIds((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) {
        next.delete(charId)
      } else {
        next.add(charId)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (!allCharacteristics?.items) return
    const allIds = allCharacteristics.items.map((c) => c.id)
    setSelectedCharIds((prev) => {
      if (prev.size === allIds.length) return new Set()
      return new Set(allIds)
    })
  }, [allCharacteristics])

  // Use the same time range state as the dashboard
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Filter templates based on license — commercial templates hidden for community
  const availableTemplates = useMemo(
    () => REPORT_TEMPLATES.filter((t) => !t.commercial || isProOrAbove),
    [isProOrAbove],
  )

  // Fetch DOE/MSA studies based on template's studyType
  const { data: doeStudies } = useDOEStudies(
    selectedTemplate?.studyType === 'doe' ? plantId : 0,
  )
  const { data: msaStudies } = useMSAStudies(
    selectedTemplate?.studyType === 'msa' ? plantId : 0,
  )

  // Fetch plant health for line-scoped templates
  const { data: plantHealth } = usePlantHealth(
    selectedTemplate?.scope === 'line' ? plantId : 0,
  )

  // Fetch DOE study detail + analysis for export (conditional on selected study)
  const { data: doeStudy } = useDOEStudy(
    selectedTemplate?.studyType === 'doe' && selectedStudyId ? selectedStudyId : 0,
  )
  const { data: doeAnalysis } = useDOEAnalysis(
    selectedTemplate?.studyType === 'doe' && selectedStudyId ? selectedStudyId : 0,
  )

  // Fetch MSA study detail + results for export (conditional on selected study)
  const { data: msaStudy } = useMSAStudy(
    selectedTemplate?.studyType === 'msa' && selectedStudyId ? selectedStudyId : 0,
  )
  const { data: msaResults } = useMSAResults(
    selectedTemplate?.studyType === 'msa' && selectedStudyId ? selectedStudyId : 0,
  )

  // Extract unique line-level hierarchy paths from plant health data
  const lineOptions = useMemo(() => {
    if (!plantHealth?.characteristics) return []
    const paths = new Set<string>()
    for (const ch of plantHealth.characteristics) {
      // hierarchy_path is e.g. "Plant > Line > Station > Char"
      // Extract the line level (second segment)
      const segments = ch.hierarchy_path.split(' > ')
      if (segments.length >= 2) {
        paths.add(segments.slice(0, 2).join(' > '))
      }
    }
    return Array.from(paths).sort()
  }, [plantHealth])

  // Reset study/line selection when template or plant changes
  useEffect(() => {
    setSelectedStudyId(null)
    setSelectedLinePath(null)
  }, [selectedTemplate?.id, plantId])

  // Initialize from URL params (from SelectionToolbar navigation) - intentional sync
   
  useEffect(() => {
    const characteristicsParam = searchParams.get('characteristics')
    if (characteristicsParam) {
      const ids = characteristicsParam
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n))
      if (ids.length > 0) {
        setSelectedCharId(ids[0])
        // Auto-select first template if not already selected
        if (!selectedTemplate) {
          setSelectedTemplate(availableTemplates[0])
        }
      }
    }
  }, [searchParams, setSelectedCharId])

  // Build chart options from time range - memoize to avoid query key changes on every render
  const chartOptions = useMemo(() => {
    if (timeRange.type === 'points') {
      return { limit: timeRange.pointsLimit ?? 50 }
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const now = new Date()
      // Round to nearest minute to avoid excessive query invalidation
      now.setSeconds(0, 0)
      const startDate = new Date(now.getTime() - timeRange.hoursBack * 60 * 60 * 1000)
      return {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
      }
    }
    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      return {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      }
    }
    // Default fallback
    return { limit: 50 }
  }, [
    timeRange.type,
    timeRange.pointsLimit,
    timeRange.hoursBack,
    timeRange.startDate,
    timeRange.endDate,
  ])

  // ── Batch export handler (needs chartOptions) ────────────────────────
  const handleBatchExport = useCallback(async () => {
    if (selectedCharIds.size === 0 || !selectedTemplate) return
    setBatchProgress({ current: 0, total: selectedCharIds.size })

    try {
      const items = await Promise.all(
        Array.from(selectedCharIds).map(async (charId) => {
          const [charDetail, charChartData, charCapability] = await Promise.all([
            characteristicApi.get(charId),
            characteristicApi.getChartData(charId, chartOptions).catch(() => null),
            capabilityApi.getCapability(charId).catch(() => null),
          ])
          return {
            characteristicName: charDetail.name,
            hierarchyPath: charDetail.hierarchy_path,
            chartData: charChartData ?? undefined,
            capability: charCapability
              ? {
                  cp: charCapability.cp,
                  cpk: charCapability.cpk,
                  pp: charCapability.pp,
                  ppk: charCapability.ppk,
                  sigma_within: charCapability.sigma_within,
                  usl: charCapability.usl,
                  lsl: charCapability.lsl,
                }
              : undefined,
          }
        }),
      )

      await exportBatchReportsToZip(items, {
        templateName: selectedTemplate.name,
        datetimeFormat,
        plantName: selectedPlant?.name,
        onProgress: (current, total) => setBatchProgress({ current, total }),
      })

      toast.success(`Exported ${items.length} reports to ZIP`)
    } catch (error) {
      console.error('Batch export failed:', error)
      toast.error('Batch export failed. Please try again.')
    } finally {
      setBatchProgress(null)
    }
  }, [selectedCharIds, selectedTemplate, chartOptions, datetimeFormat, selectedPlant])

  // Non-characteristic-scoped templates don't need a characteristic
  const isPlantScoped = selectedTemplate?.scope === 'plant'
  const isStudyScoped = selectedTemplate?.scope === 'study'
  const isLineScoped = selectedTemplate?.scope === 'line'
  const isNonCharScope = isPlantScoped || isStudyScoped || isLineScoped

  // Fetch data for export functionality (React Query caches, so these
  // don't cause extra network requests vs. the ones in ReportPreview)
  const { data: chartData } = useChartData(selectedCharId || 0, chartOptions)
  const { data: violations } = useViolations({
    characteristic_id: selectedCharId || undefined,
    per_page: 100,
  })
  const { data: characteristic } = useCharacteristic(selectedCharId || 0)
  const { data: annotations } = useAnnotations(selectedCharId || 0, !!selectedCharId)
  const { data: capability } = useCapability(selectedCharId || 0)

  // Build export data with all fields needed for PDF/Excel/CSV
  const exportData = useMemo(
    () => ({
      chartData: chartData ?? undefined,
      violations: violations?.items ?? [],
      characteristicName: characteristic?.name,
      hierarchyPath: characteristic?.hierarchy_path,
      templateName: selectedTemplate?.name,
      annotations: annotations ?? [],
      capability: capability ?? undefined,
      doeAnalysis:
        doeStudy && doeAnalysis
          ? {
              studyName: doeStudy.name,
              designType: doeStudy.design_type,
              grandMean: doeAnalysis.grand_mean,
              rSquared: doeAnalysis.r_squared,
              adjRSquared: doeAnalysis.adj_r_squared,
              anovaTable: doeAnalysis.anova_table.map((r) => ({
                source: r.source,
                sumOfSquares: r.sum_of_squares,
                df: r.df,
                meanSquare: r.mean_square,
                fValue: r.f_value,
                pValue: r.p_value,
              })),
              effects: doeAnalysis.effects.map((e) => ({
                factorName: e.factor_name,
                effect: e.effect,
                coefficient: e.coefficient,
              })),
              factors: doeStudy.factors.map((f) => ({
                name: f.name,
                lowLevel: f.low_level,
                highLevel: f.high_level,
                unit: f.unit ?? undefined,
              })),
            }
          : undefined,
      msaResults:
        msaStudy && msaResults
          ? {
              studyName: msaStudy.name,
              studyType: msaStudy.study_type ?? 'crossed',
              verdict: msaResults.verdict,
              ...('pct_study_grr' in msaResults
                ? {
                    pctStudyGrr: msaResults.pct_study_grr,
                    pctStudyEv: msaResults.pct_study_ev,
                    pctStudyAv: msaResults.pct_study_av,
                    ndc: msaResults.ndc,
                    pctToleranceGrr: msaResults.pct_tolerance_grr,
                  }
                : {}),
              ...('fleiss_kappa' in msaResults
                ? { fleissKappa: msaResults.fleiss_kappa }
                : {}),
            }
          : undefined,
      lineAssessment:
        selectedLinePath && plantHealth
          ? {
              linePath: selectedLinePath,
              characteristics: plantHealth.characteristics
                .filter((c) => c.hierarchy_path.startsWith(selectedLinePath))
                .map((c) => ({
                  name: c.name,
                  cpk: c.cpk,
                  ppk: c.ppk,
                  inControlPct: c.in_control_pct,
                  violations: c.violation_count,
                  riskScore: c.risk_score,
                })),
            }
          : undefined,
    }),
    [
      chartData,
      violations,
      characteristic,
      annotations,
      capability,
      selectedTemplate,
      doeStudy,
      doeAnalysis,
      msaStudy,
      msaResults,
      selectedLinePath,
      plantHealth,
    ],
  )

  // Determine whether we can show the report
  const needsCharacteristic = !isNonCharScope && !selectedCharId
  const needsStudy = isStudyScoped && !selectedStudyId
  const needsLine = isLineScoped && !selectedLinePath
  const canExport =
    isPlantScoped ||
    (isStudyScoped && !!selectedStudyId) ||
    (isLineScoped && !!selectedLinePath) ||
    (!isNonCharScope && selectedCharId && chartData)

  return (
    <div data-ui="reports-page" className="flex h-[calc(100vh-10rem)] flex-col gap-4">
      {/* Controls bar */}
      <div data-ui="reports-toolbar" className="bg-card border-border flex flex-shrink-0 items-center gap-4 rounded-lg border px-4 py-3">
        {/* Template dropdown */}
        <div className="flex items-center gap-2">
          <FileText className="text-muted-foreground h-4 w-4" />
          <select
            aria-label="Report template"
            value={selectedTemplate?.id ?? ''}
            onChange={(e) => {
              const tmpl = availableTemplates.find((t) => t.id === e.target.value)
              setSelectedTemplate(tmpl ?? null)
            }}
            className="bg-background border-input rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <option value="">Select template...</option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.commercial ? '★ ' : ''}{t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Commercial badge for selected template */}
        {selectedTemplate?.commercial && (
          <span className="bg-primary/10 text-primary flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
            <Lock className="h-3 w-3" />
            Commercial
          </span>
        )}

        {/* Divider */}
        <div className="border-border h-6 border-l" />

        {/* Time range */}
        <TimeRangeSelector />

        {/* Spacer + Batch Toggle + Export */}
        <div className="ml-auto flex items-center gap-2">
          {selectedTemplate && !isNonCharScope && (
            <button
              onClick={() => {
                setBatchMode((prev) => !prev)
                setSelectedCharIds(new Set())
                setBatchProgress(null)
              }}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                batchMode
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <PackageCheck className="h-4 w-4" />
              Batch Export
            </button>
          )}
          <ExportDropdown
            contentRef={reportContentRef}
            exportData={exportData}
            filename={`${selectedTemplate?.id ?? 'report'}-report`}
            disabled={!canExport}
            chartTitle={
              !isNonCharScope && selectedCharId && chartData
                ? `${characteristic?.name ?? 'chart'}-${selectedTemplate?.id ?? 'report'}`
                : undefined
            }
          />
        </div>
      </div>

      {/* Characteristic context bar — hidden for non-characteristic-scoped templates and batch mode */}
      {!isNonCharScope && !batchMode && <CharacteristicContextBar />}

      {/* Batch selection panel */}
      {batchMode && selectedTemplate && !isNonCharScope && (
        <div className="bg-card border-border flex max-h-72 flex-col rounded-lg border">
          {/* Batch header */}
          <div className="border-border flex flex-shrink-0 items-center gap-3 border-b px-4 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={
                  allCharacteristics?.items != null &&
                  allCharacteristics.items.length > 0 &&
                  selectedCharIds.size === allCharacteristics.items.length
                }
                onChange={toggleSelectAll}
                className="accent-primary h-4 w-4 rounded"
              />
              <span className="text-muted-foreground font-medium">Select All</span>
            </label>
            <span className="text-muted-foreground text-xs">
              {selectedCharIds.size} of {allCharacteristics?.items?.length ?? 0} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              {batchProgress && (
                <div className="flex items-center gap-2">
                  <Loader2 className="text-primary h-4 w-4 animate-spin" />
                  <div className="bg-muted h-2 w-32 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {batchProgress.current}/{batchProgress.total}
                  </span>
                </div>
              )}
              <button
                onClick={handleBatchExport}
                disabled={selectedCharIds.size === 0 || batchProgress !== null}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <PackageCheck className="h-4 w-4" />
                Export Selected ({selectedCharIds.size})
              </button>
            </div>
          </div>
          {/* Scrollable characteristic list */}
          <div className="flex-1 overflow-auto px-2 py-1">
            {allCharacteristics?.items?.map((char) => (
              <label
                key={char.id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedCharIds.has(char.id)}
                  onChange={() => toggleCharSelection(char.id)}
                  className="accent-primary h-4 w-4 rounded"
                />
                <span className="text-foreground font-medium">{char.name}</span>
                {char.hierarchy_path && (
                  <span className="text-muted-foreground truncate text-xs">
                    {char.hierarchy_path}
                  </span>
                )}
              </label>
            ))}
            {(!allCharacteristics?.items || allCharacteristics.items.length === 0) && (
              <div className="text-muted-foreground py-4 text-center text-sm">
                No characteristics found in this plant.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plant scope indicator for plant-wide templates */}
      {isPlantScoped && (
        <div className="bg-primary/5 border-primary/20 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
          <Lock className="text-primary h-4 w-4" />
          <span className="text-muted-foreground">
            This report covers all characteristics in the current plant.
          </span>
        </div>
      )}

      {/* Study selector for study-scoped templates */}
      {isStudyScoped && (
        <div className="bg-card border-border flex items-center gap-3 rounded-lg border px-4 py-2 text-sm">
          <span className="text-muted-foreground font-medium">
            {selectedTemplate?.studyType === 'doe' ? 'DOE Study' : 'MSA Study'}:
          </span>
          <select
            aria-label="Select study"
            value={selectedStudyId ?? ''}
            onChange={(e) => setSelectedStudyId(e.target.value ? Number(e.target.value) : null)}
            className="bg-background border-input rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">Select a study...</option>
            {selectedTemplate?.studyType === 'doe'
              ? doeStudies?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))
              : msaStudies?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
          </select>
        </div>
      )}

      {/* Line selector for line-scoped templates */}
      {isLineScoped && (
        <div className="bg-card border-border flex items-center gap-3 rounded-lg border px-4 py-2 text-sm">
          <span className="text-muted-foreground font-medium">Line:</span>
          <select
            aria-label="Select line"
            value={selectedLinePath ?? ''}
            onChange={(e) => setSelectedLinePath(e.target.value || null)}
            className="bg-background border-input rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">Select a line...</option>
            {lineOptions.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Report preview — full width */}
      {needsCharacteristic ? (
        <NoCharacteristicState />
      ) : needsStudy ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileText className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-1 font-semibold">Select a study</h3>
            <p className="text-muted-foreground text-sm">
              Choose a study from the dropdown above to generate the report.
            </p>
          </div>
        </div>
      ) : needsLine ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileText className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-1 font-semibold">Select a line</h3>
            <p className="text-muted-foreground text-sm">
              Choose a production line from the dropdown above to generate the report.
            </p>
          </div>
        </div>
      ) : !selectedTemplate ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileText className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-1 font-semibold">No template selected</h3>
            <p className="text-muted-foreground text-sm">
              Choose a report template from the dropdown above to preview.
            </p>
          </div>
        </div>
      ) : (
        <div data-ui="reports-content" ref={reportContentRef} className="flex-1 overflow-auto">
          <ErrorBoundary>
            <ReportPreview
              template={selectedTemplate}
              characteristicIds={selectedCharId ? [selectedCharId] : []}
              chartOptions={chartOptions}
              studyId={selectedStudyId ?? undefined}
              linePath={selectedLinePath ?? undefined}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}

export default ReportsView
