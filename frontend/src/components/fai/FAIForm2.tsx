import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAddFAIMaterial,
  useDeleteFAIMaterial,
  useAddFAISpecialProcess,
  useDeleteFAISpecialProcess,
  useAddFAIFunctionalTest,
  useDeleteFAIFunctionalTest,
} from '@/api/hooks'
import type { FAIReportDetail } from '@/api/client'

interface FAIForm2Props {
  report: FAIReportDetail
  readonly: boolean
}

export function FAIForm2({ report, readonly }: FAIForm2Props) {
  const addMaterial = useAddFAIMaterial()
  const deleteMaterial = useDeleteFAIMaterial()
  const addProcess = useAddFAISpecialProcess()
  const deleteProcess = useDeleteFAISpecialProcess()
  const addTest = useAddFAIFunctionalTest()
  const deleteTest = useDeleteFAIFunctionalTest()

  const materials = report.materials ?? []
  const processes = report.special_processes_items ?? []
  const tests = report.functional_tests_items ?? []

  const headerClass = 'text-muted-foreground px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider'
  const cellClass = 'px-3 py-2 text-sm'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-base font-semibold">
          AS9102 Form 2 — Product Accountability
        </h2>
        <p className="text-muted-foreground text-sm">
          Material traceability, special process certifications, and functional test results.
        </p>
      </div>

      {/* ── Materials ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Materials</h3>
          {!readonly && (
            <button
              onClick={() =>
                addMaterial.mutate({ reportId: report.id, data: {} })
              }
              disabled={addMaterial.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {addMaterial.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Material
            </button>
          )}
        </div>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className={headerClass}>Part Number</th>
                <th className={headerClass}>Material Spec</th>
                <th className={headerClass}>Cert Number</th>
                <th className={headerClass}>Supplier</th>
                <th className={cn(headerClass, 'w-24')}>Result</th>
                {!readonly && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 ? (
                <tr>
                  <td
                    colSpan={readonly ? 5 : 6}
                    className="text-muted-foreground px-4 py-6 text-center text-sm"
                  >
                    No materials added yet.
                  </td>
                </tr>
              ) : (
                materials.map((m, idx) => (
                  <tr
                    key={m.id}
                    className={cn(
                      'border-border/50 border-t',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                    )}
                  >
                    <td className={cellClass}>{m.material_part_number ?? '--'}</td>
                    <td className={cellClass}>{m.material_spec ?? '--'}</td>
                    <td className={cellClass}>{m.cert_number ?? '--'}</td>
                    <td className={cellClass}>{m.supplier ?? '--'}</td>
                    <td className={cellClass}>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          m.result === 'pass'
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400',
                        )}
                      >
                        {m.result === 'pass' ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    {!readonly && (
                      <td className={cn(cellClass, 'text-center')}>
                        <button
                          onClick={() =>
                            deleteMaterial.mutate({
                              reportId: report.id,
                              materialId: m.id,
                            })
                          }
                          className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
                          title="Delete material"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Special Processes ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Special Processes</h3>
          {!readonly && (
            <button
              onClick={() =>
                addProcess.mutate({ reportId: report.id, data: {} })
              }
              disabled={addProcess.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {addProcess.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Process
            </button>
          )}
        </div>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className={headerClass}>Process Name</th>
                <th className={headerClass}>Process Spec</th>
                <th className={headerClass}>Cert Number</th>
                <th className={headerClass}>Approved Supplier</th>
                <th className={cn(headerClass, 'w-24')}>Result</th>
                {!readonly && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr>
                  <td
                    colSpan={readonly ? 5 : 6}
                    className="text-muted-foreground px-4 py-6 text-center text-sm"
                  >
                    No special processes added yet.
                  </td>
                </tr>
              ) : (
                processes.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-border/50 border-t',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                    )}
                  >
                    <td className={cellClass}>{p.process_name ?? '--'}</td>
                    <td className={cellClass}>{p.process_spec ?? '--'}</td>
                    <td className={cellClass}>{p.cert_number ?? '--'}</td>
                    <td className={cellClass}>{p.approved_supplier ?? '--'}</td>
                    <td className={cellClass}>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          p.result === 'pass'
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400',
                        )}
                      >
                        {p.result === 'pass' ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    {!readonly && (
                      <td className={cn(cellClass, 'text-center')}>
                        <button
                          onClick={() =>
                            deleteProcess.mutate({
                              reportId: report.id,
                              processId: p.id,
                            })
                          }
                          className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
                          title="Delete process"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Functional Tests ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Functional Tests</h3>
          {!readonly && (
            <button
              onClick={() =>
                addTest.mutate({ reportId: report.id, data: {} })
              }
              disabled={addTest.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {addTest.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Test
            </button>
          )}
        </div>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className={headerClass}>Test Description</th>
                <th className={headerClass}>Procedure Number</th>
                <th className={headerClass}>Actual Results</th>
                <th className={cn(headerClass, 'w-24')}>Result</th>
                {!readonly && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {tests.length === 0 ? (
                <tr>
                  <td
                    colSpan={readonly ? 4 : 5}
                    className="text-muted-foreground px-4 py-6 text-center text-sm"
                  >
                    No functional tests added yet.
                  </td>
                </tr>
              ) : (
                tests.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={cn(
                      'border-border/50 border-t',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                    )}
                  >
                    <td className={cellClass}>{t.test_description ?? '--'}</td>
                    <td className={cellClass}>{t.procedure_number ?? '--'}</td>
                    <td className={cellClass}>{t.actual_results ?? '--'}</td>
                    <td className={cellClass}>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          t.result === 'pass'
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400',
                        )}
                      >
                        {t.result === 'pass' ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    {!readonly && (
                      <td className={cn(cellClass, 'text-center')}>
                        <button
                          onClick={() =>
                            deleteTest.mutate({
                              reportId: report.id,
                              testId: t.id,
                            })
                          }
                          className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
                          title="Delete test"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legacy fields (read-only) */}
      {(report.material_supplier || report.material_spec) && (
        <div className="border-border rounded-lg border bg-amber-50/50 p-4 dark:bg-amber-950/10">
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            Legacy Fields (read-only — migrated to tables above)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.material_supplier && (
              <div>
                <span className="text-muted-foreground text-xs">Material Supplier:</span>
                <p className="text-sm">{report.material_supplier}</p>
              </div>
            )}
            {report.material_spec && (
              <div>
                <span className="text-muted-foreground text-xs">Material Spec:</span>
                <p className="text-sm">{report.material_spec}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
