import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'

interface PCAScreePlotProps {
	/** Explained variance ratio per component */
	explainedVarianceRatios: number[]
	/** Cumulative variance ratios */
	cumulativeVariance: number[]
	/** Eigenvalues (optional, shown in tooltip) */
	eigenvalues?: number[]
}

/**
 * PCA Scree Plot -- bar chart of explained variance per component
 * with a cumulative line overlay.
 *
 * Labels show "PC1: 45%, PC2: 28%, ..." on the bars.
 */
export function PCAScreePlot({
	explainedVarianceRatios,
	cumulativeVariance,
	eigenvalues,
}: PCAScreePlotProps) {
	const { resolvedTheme } = useTheme()
	const isDark = resolvedTheme === 'dark'

	const option = useMemo(() => {
		if (!explainedVarianceRatios || explainedVarianceRatios.length === 0) return null

		const nComponents = explainedVarianceRatios.length

		// Labels: PC1, PC2, ...
		const labels = Array.from({ length: nComponents }, (_, i) => `PC${i + 1}`)

		// Convert to percentages for display
		const barData = explainedVarianceRatios.map((r) => +(r * 100).toFixed(2))
		const lineData = cumulativeVariance.map((r) => +(r * 100).toFixed(2))

		// Theme-aware colors
		const barColor = isDark ? 'hsl(210, 80%, 55%)' : '#3b82f6'
		const lineColor = isDark ? 'hsl(32, 85%, 55%)' : '#f97316'
		const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
		const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : undefined
		const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
		const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
		const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'

		return {
			tooltip: {
				trigger: 'axis' as const,
				backgroundColor: tooltipBg,
				borderColor: tooltipBorder,
				textStyle: { color: tooltipTextColor, fontSize: 12 },
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				formatter: (params: any) => {
					const idx = params[0]?.dataIndex ?? 0
					const pct = barData[idx] ?? 0
					const cum = lineData[idx] ?? 0
					let html = `<strong>${labels[idx]}</strong><br/>`
					html += `Variance: ${pct.toFixed(1)}%<br/>`
					html += `Cumulative: ${cum.toFixed(1)}%`
					if (eigenvalues && eigenvalues[idx] != null) {
						html += `<br/>Eigenvalue: ${eigenvalues[idx].toFixed(4)}`
					}
					return html
				},
			},
			grid: {
				top: 40,
				left: 55,
				right: 20,
				bottom: 40,
			},
			xAxis: {
				type: 'category' as const,
				data: labels,
				axisLabel: { color: axisLabelColor, fontSize: 11 },
			},
			yAxis: {
				type: 'value' as const,
				name: 'Variance (%)',
				nameTextStyle: { color: axisLabelColor, fontSize: 11 },
				max: 100,
				axisLabel: {
					color: axisLabelColor,
					fontSize: 11,
					formatter: '{value}%',
				},
				splitLine: {
					lineStyle: { type: 'dashed' as const, opacity: 0.3, color: splitLineColor },
				},
			},
			series: [
				{
					type: 'bar' as const,
					name: 'Explained Variance',
					data: barData,
					itemStyle: { color: barColor, borderRadius: [3, 3, 0, 0] },
					label: {
						show: nComponents <= 10,
						position: 'top' as const,
						fontSize: 10,
						color: axisLabelColor,
						formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
					},
					barMaxWidth: 40,
				},
				{
					type: 'line' as const,
					name: 'Cumulative',
					data: lineData,
					smooth: true,
					lineStyle: { color: lineColor, width: 2 },
					itemStyle: { color: lineColor },
					symbol: 'circle',
					symbolSize: 6,
					label: {
						show: false,
					},
				},
			],
		}
	}, [explainedVarianceRatios, cumulativeVariance, eigenvalues, isDark])

	const hasData = explainedVarianceRatios && explainedVarianceRatios.length > 0
	const { containerRef } = useECharts({ option })

	return (
		<div className="relative h-[300px] w-full">
			<div
				ref={containerRef}
				className="h-full w-full"
				style={{ visibility: hasData ? 'visible' : 'hidden' }}
			/>
			{!hasData && (
				<div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
					No PCA data available
				</div>
			)}
		</div>
	)
}
