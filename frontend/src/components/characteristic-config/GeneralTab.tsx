import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { ProtocolBadge } from '../connectivity/ProtocolBadge'
import { ChevronRight, ExternalLink, PenLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DataSourceResponse } from '@/types'

interface FormData {
  name: string
  description: string
  decimal_precision: string
}

interface GeneralCharacteristic {
  data_source: DataSourceResponse | null
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
  characteristic: GeneralCharacteristic
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

          {/* Hierarchy Location */}
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

          {/* Data Source Summary Card */}
          <DataSourceSummary dataSource={characteristic.data_source} />
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

/**
 * DataSourceSummary — compact read-only card showing the data source status.
 * If a data source is configured: shows protocol badge, trigger strategy, active status,
 * and a link to Connectivity Hub for management.
 * If null: shows "Manual entry" with a link to configure a data source.
 */
function DataSourceSummary({ dataSource }: { dataSource: DataSourceResponse | null }) {
  if (!dataSource) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Manual Entry</p>
              <p className="text-xs text-muted-foreground">No data source configured</p>
            </div>
          </div>
          <Link
            to="/connectivity"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Add Data Source
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProtocolBadge protocol={dataSource.type} size="md" />
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              dataSource.is_active ? 'text-green-500' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                dataSource.is_active ? 'bg-green-500' : 'bg-muted-foreground'
              }`}
            />
            {dataSource.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link
          to="/connectivity"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Manage in Connectivity
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Trigger</span>
          <p className="font-mono">{dataSource.trigger_strategy}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Source ID</span>
          <p className="font-mono">#{dataSource.id}</p>
        </div>
      </div>
    </div>
  )
}
