import { useDOEAnalysis } from '@/api/hooks/doe'
import { ANOVATable } from '@/components/doe/ANOVATable'
import { Table2 } from 'lucide-react'

interface ReportAnovaResultsProps {
  studyId?: number
}

export function ReportAnovaResults({ studyId }: ReportAnovaResultsProps) {
  const { data: analysis } = useDOEAnalysis(studyId ?? 0)

  if (!analysis) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Table2 className="h-5 w-5" />
        ANOVA Results
      </h2>

      {/* Grand mean summary */}
      <div className="bg-muted/50 mb-4 rounded-lg p-3">
        <span className="text-muted-foreground text-xs font-medium">Grand Mean: </span>
        <span className="font-mono text-lg font-bold">{analysis.grand_mean.toFixed(4)}</span>
      </div>

      {/* Reuse the same ANOVA table from the DOE study page */}
      <ANOVATable
        anova={analysis.anova_table}
        r_squared={analysis.r_squared}
        adj_r_squared={analysis.adj_r_squared}
        pred_r_squared={analysis.pred_r_squared}
        lack_of_fit_f={analysis.lack_of_fit_f}
        lack_of_fit_p={analysis.lack_of_fit_p}
      />
    </div>
  )
}
