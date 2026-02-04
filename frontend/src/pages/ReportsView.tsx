import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { REPORT_TEMPLATES, getTemplateById, ReportTemplate } from '@/lib/report-templates'
import { ReportPreview } from '@/components/ReportPreview'
import { ExportDropdown } from '@/components/ExportDropdown'
import { useCharacteristics } from '@/api/hooks'
import { FileText, ChevronRight, Check } from 'lucide-react'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [selectedCharacteristicIds, setSelectedCharacteristicIds] = useState<number[]>([])
  const { data: characteristicsData } = useCharacteristics()
  const reportContentRef = useRef<HTMLDivElement>(null)

  // Initialize from URL params (from SelectionToolbar navigation)
  useEffect(() => {
    const characteristicsParam = searchParams.get('characteristics')
    if (characteristicsParam) {
      const ids = characteristicsParam.split(',').map(Number).filter((n) => !isNaN(n))
      if (ids.length > 0) {
        setSelectedCharacteristicIds(ids)
        // Auto-select first template if not already selected
        if (!selectedTemplate) {
          setSelectedTemplate(REPORT_TEMPLATES[0])
        }
      }
    }
  }, [searchParams])

  const handleSelectCharacteristic = (id: number) => {
    setSelectedCharacteristicIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id)
      }
      return [...prev, id]
    })
  }

  const handleClearSelection = () => {
    setSelectedCharacteristicIds([])
  }

  return (
    <div className="h-[calc(100vh-10rem)]">
      <div className="grid grid-cols-12 gap-6 h-full">
        {/* Left Panel - Template Selection */}
        <div className="col-span-3 flex flex-col gap-4 h-full overflow-hidden">
          <div className="border border-border rounded-xl bg-card overflow-hidden flex-1 flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Report Templates
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <div className="space-y-2">
                {REPORT_TEMPLATES.map((template) => {
                  const Icon = template.icon
                  const isSelected = selectedTemplate?.id === template.id
                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-colors',
                        'border border-transparent',
                        isSelected
                          ? 'bg-primary/10 border-primary/30'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                          {template.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Characteristic Selection */}
          <div className="border border-border rounded-xl bg-card overflow-hidden h-64">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Characteristics</h3>
              {selectedCharacteristicIds.length > 0 && (
                <button
                  onClick={handleClearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear ({selectedCharacteristicIds.length})
                </button>
              )}
            </div>
            <div className="overflow-auto h-[calc(100%-3.5rem)] p-2">
              <div className="space-y-1">
                {characteristicsData?.items.map((char) => {
                  const isSelected = selectedCharacteristicIds.includes(char.id)
                  return (
                    <button
                      key={char.id}
                      onClick={() => handleSelectCharacteristic(char.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
                        'hover:bg-muted transition-colors',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center',
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="flex-1">{char.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="col-span-9 flex flex-col h-full overflow-hidden">
          {selectedTemplate ? (
            <>
              {/* Preview Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Templates</span>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-foreground font-medium">{selectedTemplate.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {selectedCharacteristicIds.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {selectedCharacteristicIds.length} characteristic{selectedCharacteristicIds.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                  <ExportDropdown
                    contentRef={reportContentRef}
                    filename={`${selectedTemplate.id}-report`}
                    disabled={selectedCharacteristicIds.length === 0}
                  />
                </div>
              </div>

              {/* Report Preview */}
              <div ref={reportContentRef} className="flex-1 overflow-auto">
                <ReportPreview
                  template={selectedTemplate}
                  characteristicIds={selectedCharacteristicIds}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Select a report template to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportsView
