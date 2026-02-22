import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  Printer,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useFAIReport,
  useUpdateFAIReport,
  useSubmitFAIReport,
  useApproveFAIReport,
  useRejectFAIReport,
} from '@/api/hooks'
import { FAIForm1 } from './FAIForm1'
import { FAIForm2 } from './FAIForm2'
import { FAIForm3 } from './FAIForm3'
import { FAIPrintView } from './FAIPrintView'

const TABS = [
  { key: 'form1', label: 'Form 1 — Part Number Accountability' },
  { key: 'form2', label: 'Form 2 — Product Accountability' },
  { key: 'form3', label: 'Form 3 — Characteristic Accountability' },
] as const

type TabKey = (typeof TABS)[number]['key']

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  submitted: { label: 'Submitted', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  approved: { label: 'Approved', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

export function FAIReportEditor() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const id = Number(reportId)

  const { data: report, isLoading } = useFAIReport(id)
  const updateReport = useUpdateFAIReport()
  const submitReport = useSubmitFAIReport()
  const approveReport = useApproveFAIReport()
  const rejectReport = useRejectFAIReport()

  const [activeTab, setActiveTab] = useState<TabKey>('form1')
  const [showPrint, setShowPrint] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">Report not found</p>
        <button
          onClick={() => navigate('/fai')}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          Back to FAI Reports
        </button>
      </div>
    )
  }

  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.draft
  const isDraft = report.status === 'draft'
  const isSubmitted = report.status === 'submitted'

  const handleSubmit = async () => {
    try {
      await submitReport.mutateAsync(id)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleApprove = async () => {
    try {
      await approveReport.mutateAsync(id)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    try {
      await rejectReport.mutateAsync({ reportId: id, reason: rejectReason })
      setShowRejectDialog(false)
      setRejectReason('')
    } catch {
      // Error handled by mutation hook
    }
  }

  if (showPrint) {
    return <FAIPrintView report={report} onClose={() => setShowPrint(false)} />
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/fai')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">
              FAI Report: {report.part_number}
              {report.revision ? ` Rev ${report.revision}` : ''}
            </h1>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                  statusStyle.bg,
                  statusStyle.text,
                )}
              >
                {statusStyle.label}
              </span>
              {report.part_name && (
                <span className="text-muted-foreground text-sm">{report.part_name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrint(true)}
            className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>

          {isDraft && (
            <>
              <button
                onClick={handleSubmit}
                disabled={submitReport.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-blue-600 text-white hover:bg-blue-700',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {submitReport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit
              </button>
            </>
          )}

          {isSubmitted && (
            <>
              <button
                onClick={handleApprove}
                disabled={approveReport.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-green-600 text-white hover:bg-green-700',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {approveReport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => setShowRejectDialog(true)}
                disabled={rejectReport.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-red-600 text-white hover:bg-red-700',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Rejection reason display */}
      {report.status === 'rejected' && report.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-900/10">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Rejection Reason:</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-300">{report.rejection_reason}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-border flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === 'form1' && (
          <FAIForm1 report={report} readonly={!isDraft} />
        )}
        {activeTab === 'form2' && (
          <FAIForm2 report={report} readonly={!isDraft} />
        )}
        {activeTab === 'form3' && (
          <FAIForm3 report={report} readonly={!isDraft} />
        )}
      </div>

      {/* Reject dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRejectDialog(false)} />
          <div className="bg-card border-border relative mx-4 w-full max-w-md rounded-xl border p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Reject FAI Report</h3>
            <label className="text-sm font-medium">Reason for Rejection</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="border-border bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              rows={4}
              placeholder="Describe why this report is being rejected..."
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectReport.isPending || !rejectReason.trim()}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {rejectReport.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
