import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { ChevronRight } from 'lucide-react'
import type { SubgroupMode } from '@/types'

interface FormData {
  name: string
  description: string
  decimal_precision: string
}

interface Characteristic {
  provider_type: string
  hierarchy_id: number
  created_at?: string
  updated_at?: string
  sample_count?: number
}

interface HierarchyBreadcrumb {
  id: number
  name: string
  type: string
}

interface GeneralTabProps {
  formData: FormData
  characteristic: Characteristic
  hierarchyPath?: HierarchyBreadcrumb[]
  onChange: (field: string, value: string) => void
}

export function GeneralTab({
  formData,
  characteristic,
  hierarchyPath = [],
  onChange,
}: GeneralTabProps) {
  return (
    <Accordion defaultOpen={['identity']} className="space-y-3">
      {/* Identity Section - Default Open */}
      <AccordionSection id="identity" title="Identity">
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange('name', e.target.value)}
              className="w-full mt-1.5 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Enter characteristic name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => onChange('description', e.target.value)}
              className="w-full mt-1.5 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Optional description"
            />
          </div>

          {/* Provider & Location Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Provider Badge */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Provider</label>
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-muted rounded-lg">
                  {characteristic.provider_type === 'MANUAL' ? (
                    <>
                      <span className="text-base">📝</span>
                      <span>Manual Entry</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">📡</span>
                      <span>MQTT Tag</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Hierarchy Breadcrumb */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Location</label>
              <div className="mt-1.5">
                {hierarchyPath.length > 0 ? (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    {hierarchyPath.map((node, idx) => (
                      <span key={node.id} className="flex items-center">
                        {idx > 0 && <ChevronRight className="h-3 w-3 mx-0.5" />}
                        <span className="hover:text-foreground cursor-pointer">{node.name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Hierarchy #{characteristic.hierarchy_id}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Display Options Section - Default Closed */}
      <AccordionSection id="display" title="Display Options">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Decimal Precision</label>
            <div className="flex items-center gap-4 mt-1.5">
              <NumberInput
                min={0}
                max={10}
                value={formData.decimal_precision}
                onChange={(value) => onChange('decimal_precision', value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                decimal places (0-10)
              </span>
            </div>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-xs text-muted-foreground">Preview: </span>
              <span className="text-sm font-mono">
                123.456789 → {(123.456789).toFixed(parseInt(formData.decimal_precision) || 3)}
              </span>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Metadata Section - Default Closed */}
      <AccordionSection id="metadata" title="Metadata">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Created</span>
            <p className="font-medium">
              {characteristic.created_at
                ? new Date(characteristic.created_at).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Modified</span>
            <p className="font-medium">
              {characteristic.updated_at
                ? new Date(characteristic.updated_at).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Sample Count</span>
            <p className="font-medium">{characteristic.sample_count ?? '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Hierarchy ID</span>
            <p className="font-medium">{characteristic.hierarchy_id}</p>
          </div>
        </div>
      </AccordionSection>
    </Accordion>
  )
}
