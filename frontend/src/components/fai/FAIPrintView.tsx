import { ArrowLeft, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { FAIReportDetail } from '@/api/client'

interface FAIPrintViewProps {
  report: FAIReportDetail
  onClose: () => void
}

const printStyles = `
@media print {
  body * { visibility: hidden; }
  #fai-print-content, #fai-print-content * { visibility: visible; }
  #fai-print-content { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  @page { margin: 0.5in; size: landscape; }
}
`

export function FAIPrintView({ report, onClose }: FAIPrintViewProps) {
  const { formatDate } = useDateFormat()
  const items = report.items ?? []
  const passCount = items.filter((i) => i.result === 'pass').length
  const failCount = items.filter((i) => i.result === 'fail').length
  const devCount = items.filter((i) => i.result === 'deviation').length

  const handlePrint = () => {
    window.print()
  }

  const thClass = 'border border-gray-400 bg-gray-100 px-2 py-1 text-left text-xs font-semibold'
  const tdClass = 'border border-gray-300 px-2 py-1 text-xs'
  const tdRightClass = 'border border-gray-300 px-2 py-1 text-xs text-right'
  const labelClass = 'border border-gray-400 bg-gray-50 px-2 py-1 text-xs font-medium w-1/4'
  const valueClass = 'border border-gray-300 px-2 py-1 text-xs w-1/4'

  return (
    <>
      <style>{printStyles}</style>
      <div className="flex flex-col gap-4 p-6">
        {/* Control bar - hidden in print */}
        <div className="no-print flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Editor
          </button>
          <button
            onClick={handlePrint}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>

        {/* Print content */}
        <div
          id="fai-print-content"
          className="mx-auto max-w-[1200px] bg-white text-black"
        >
          {/* ---- FORM 1: Part Number Accountability ---- */}
          <div className="mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    colSpan={4}
                    className="border border-gray-400 bg-gray-200 px-3 py-2 text-center text-sm font-bold"
                  >
                    AS9102 First Article Inspection — Form 1: Part Number Accountability
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={labelClass}>Part Number</td>
                  <td className={valueClass}>{report.part_number}</td>
                  <td className={labelClass}>Part Name</td>
                  <td className={valueClass}>{report.part_name || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Revision</td>
                  <td className={valueClass}>{report.revision || '--'}</td>
                  <td className={labelClass}>Drawing Number</td>
                  <td className={valueClass}>{report.drawing_number || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Serial Number</td>
                  <td className={valueClass}>{report.serial_number || '--'}</td>
                  <td className={labelClass}>Lot Number</td>
                  <td className={valueClass}>{report.lot_number || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Organization</td>
                  <td className={valueClass}>{report.organization_name || '--'}</td>
                  <td className={labelClass}>Supplier</td>
                  <td className={valueClass}>{report.supplier || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Purchase Order</td>
                  <td className={valueClass}>{report.purchase_order || '--'}</td>
                  <td className={labelClass}>Reason for Inspection</td>
                  <td className={valueClass}>{report.reason_for_inspection || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Status</td>
                  <td className={valueClass}>{report.status.toUpperCase()}</td>
                  <td className={labelClass}>Created</td>
                  <td className={valueClass}>
                    {formatDate(report.created_at)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---- FORM 2: Product Accountability ---- */}
          <div className="mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    colSpan={4}
                    className="border border-gray-400 bg-gray-200 px-3 py-2 text-center text-sm font-bold"
                  >
                    Form 2: Product Accountability — Raw Material, Special Processes, Functional
                    Testing
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={labelClass}>Material Supplier</td>
                  <td className={valueClass}>{report.material_supplier || '--'}</td>
                  <td className={labelClass}>Material Spec</td>
                  <td className={valueClass}>{report.material_spec || '--'}</td>
                </tr>
                <tr>
                  <td className={labelClass}>Special Processes</td>
                  <td colSpan={3} className={cn(valueClass, 'w-3/4 whitespace-pre-wrap')}>
                    {report.special_processes || '--'}
                  </td>
                </tr>
                <tr>
                  <td className={labelClass}>Functional Test Results</td>
                  <td colSpan={3} className={cn(valueClass, 'w-3/4 whitespace-pre-wrap')}>
                    {report.functional_test_results || '--'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---- FORM 3: Characteristic Accountability ---- */}
          <div className="mb-4">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    colSpan={11}
                    className="border border-gray-400 bg-gray-200 px-3 py-2 text-center text-sm font-bold"
                  >
                    Form 3: Characteristic Accountability
                  </th>
                </tr>
                <tr>
                  <th className={thClass}>Balloon #</th>
                  <th className={thClass}>Characteristic</th>
                  <th className={cn(thClass, 'text-right')}>Nominal</th>
                  <th className={cn(thClass, 'text-right')}>USL</th>
                  <th className={cn(thClass, 'text-right')}>LSL</th>
                  <th className={cn(thClass, 'text-right')}>Actual</th>
                  <th className={thClass}>Unit</th>
                  <th className={thClass}>Tools Used</th>
                  <th className={cn(thClass, 'text-center')}>Designed</th>
                  <th className={thClass}>Result</th>
                  <th className={thClass}>Deviation Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className={cn(tdClass, 'py-4 text-center text-gray-500')}>
                      No inspection items recorded
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        item.result === 'fail' && 'bg-red-50',
                        item.result === 'deviation' && 'bg-amber-50',
                      )}
                    >
                      <td className={tdClass}>{item.balloon_number || '--'}</td>
                      <td className={tdClass}>{item.characteristic_name || '--'}</td>
                      <td className={tdRightClass}>
                        {item.nominal != null ? item.nominal : '--'}
                      </td>
                      <td className={tdRightClass}>
                        {item.usl != null ? item.usl : '--'}
                      </td>
                      <td className={tdRightClass}>
                        {item.lsl != null ? item.lsl : '--'}
                      </td>
                      <td className={tdRightClass}>
                        {item.actual_value != null ? item.actual_value : '--'}
                      </td>
                      <td className={tdClass}>{item.unit || '--'}</td>
                      <td className={tdClass}>{item.tools_used || '--'}</td>
                      <td className={cn(tdClass, 'text-center')}>
                        {item.designed_char ? 'Y' : 'N'}
                      </td>
                      <td
                        className={cn(
                          tdClass,
                          item.result === 'pass' && 'font-semibold text-green-700',
                          item.result === 'fail' && 'font-bold text-red-700',
                          item.result === 'deviation' && 'font-semibold text-amber-700',
                        )}
                      >
                        {item.result
                          ? item.result.charAt(0).toUpperCase() + item.result.slice(1)
                          : '--'}
                      </td>
                      <td className={tdClass}>{item.deviation_reason || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mb-4">
            <table className="border-collapse border border-gray-400">
              <tbody>
                <tr>
                  <td className={cn(labelClass, 'w-auto')}>Total Items</td>
                  <td className={cn(valueClass, 'w-auto')}>{items.length}</td>
                  <td className={cn(labelClass, 'w-auto')}>Pass</td>
                  <td className={cn(valueClass, 'w-auto font-semibold text-green-700')}>
                    {passCount}
                  </td>
                  <td className={cn(labelClass, 'w-auto')}>Fail</td>
                  <td className={cn(valueClass, 'w-auto font-semibold text-red-700')}>
                    {failCount}
                  </td>
                  <td className={cn(labelClass, 'w-auto')}>Deviation</td>
                  <td className={cn(valueClass, 'w-auto font-semibold text-amber-700')}>
                    {devCount}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Rejection reason */}
          {report.status === 'rejected' && report.rejection_reason && (
            <div className="mb-4 border border-red-300 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-red-700">Rejection Reason:</p>
              <p className="mt-1 text-xs text-red-600">{report.rejection_reason}</p>
            </div>
          )}

          {/* Signature lines */}
          <div className="mt-8 flex gap-8">
            <div className="flex-1">
              <div className="mb-1 border-b border-gray-400" />
              <p className="text-xs text-gray-600">Inspector Signature / Date</p>
            </div>
            <div className="flex-1">
              <div className="mb-1 border-b border-gray-400" />
              <p className="text-xs text-gray-600">Quality Approval / Date</p>
            </div>
            <div className="flex-1">
              <div className="mb-1 border-b border-gray-400" />
              <p className="text-xs text-gray-600">Customer Approval / Date</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
