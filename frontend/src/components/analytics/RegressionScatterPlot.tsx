import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'
import type { RegressionScatterResponse } from '@/api/correlation.api'

interface RegressionScatterPlotProps {
	data: RegressionScatterResponse
}

/**
 * RegressionScatterPlot — ECharts scatter + OLS regression line with
 * 95% confidence and prediction bands.
 *
 * Annotation shows the fitted equation, R-squared, p-value, and n.
 */
export function RegressionScatterPlot({ data }: RegressionScatterPlotProps) {
	const { resolvedTheme } = useTheme()
	const isDark = resolvedTheme === 'dark'

	const option = useMemo(() => {
		if (!data) return null

		const scatterColor = isDark ? 'hsl(210, 90%, 65%)' : '#3b82f6'
		const lineColor = isDark ? 'hsl(350, 80%, 65%)' : '#ef4444'
		const confColor = isDark ? 'hsl(210, 60%, 55%)' : '#60a5fa'
		const predColor = isDark ? 'hsl(280, 50%, 55%)' : '#a78bfa'
		const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
		const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : undefined
		const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
		const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
		const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'
		const annotationBg = isDark ? 'rgba(30, 37, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)'

		// Format equation annotation
		const slopeStr = data.slope >= 0 ? data.slope.toFixed(4) : `(${data.slope.toFixed(4)})`
		const interceptSign = data.intercept >= 0 ? '+' : ''
		const equation = `\u0177 = ${slopeStr}x ${interceptSign} ${data.intercept.toFixed(4)}`
		const annotation = [
			equation,
			`R\u00b2 = ${data.r_squared.toFixed(4)}`,
			`p = ${data.p_value < 0.001 ? data.p_value.toExponential(2) : data.p_value.toFixed(4)}`,
			`n = ${data.sample_count}`,
		].join('\n')

		// Scatter data points
		const scatterData = data.points.map((p) => [p.x, p.y])

		return {
			tooltip: {
				trigger: 'item' as const,
				backgroundColor: tooltipBg,
				borderColor: tooltipBorder,
				textStyle: { color: tooltipTextColor, fontSize: 12 },
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				formatter: (params: any) => {
					if (params.seriesName === 'Data') {
						const point = data.points[params.dataIndex]
						if (!point) return ''
						const yHat = data.intercept + data.slope * point.x
						return [
							`<b>${data.x_name}:</b> ${point.x.toFixed(4)}`,
							`<b>${data.y_name}:</b> ${point.y.toFixed(4)}`,
							`<b>Predicted:</b> ${yHat.toFixed(4)}`,
							`<b>Residual:</b> ${point.residual.toFixed(4)}`,
						].join('<br/>')
					}
					return ''
				},
			},
			grid: {
				top: 30,
				left: 70,
				right: 30,
				bottom: 50,
			},
			xAxis: {
				type: 'value' as const,
				name: data.x_name,
				nameLocation: 'center' as const,
				nameGap: 30,
				nameTextStyle: {
					fontSize: 12,
					fontWeight: 'bold' as const,
					color: axisLabelColor,
				},
				axisLabel: { color: axisLabelColor },
				splitLine: {
					lineStyle: { type: 'dashed' as const, opacity: 0.3, color: splitLineColor },
				},
			},
			yAxis: {
				type: 'value' as const,
				name: data.y_name,
				nameLocation: 'center' as const,
				nameGap: 50,
				nameTextStyle: {
					fontSize: 12,
					fontWeight: 'bold' as const,
					color: axisLabelColor,
				},
				axisLabel: { color: axisLabelColor },
				splitLine: {
					lineStyle: { type: 'dashed' as const, opacity: 0.3, color: splitLineColor },
				},
			},
			graphic: [
				{
					type: 'text' as const,
					left: 80,
					top: 10,
					style: {
						text: annotation,
						fill: axisLabelColor,
						fontSize: 11,
						fontFamily: 'monospace',
						lineHeight: 16,
						backgroundColor: annotationBg,
						padding: [6, 10],
						borderRadius: 4,
					},
				},
			],
			series: [
				// Scatter points
				{
					type: 'scatter' as const,
					name: 'Data',
					data: scatterData,
					symbolSize: 7,
					itemStyle: { color: scatterColor, opacity: 0.8 },
					z: 10,
				},
				// Regression line
				{
					type: 'line' as const,
					name: 'Regression',
					data: data.regression_line,
					showSymbol: false,
					lineStyle: { color: lineColor, width: 2.5 },
					itemStyle: { color: lineColor },
					z: 5,
				},
				// Confidence band upper
				{
					type: 'line' as const,
					name: '95% CI Upper',
					data: data.confidence_band_upper,
					showSymbol: false,
					lineStyle: { color: confColor, width: 1.5, type: 'dashed' as const, opacity: 0.7 },
					itemStyle: { color: confColor },
					z: 3,
				},
				// Confidence band lower
				{
					type: 'line' as const,
					name: '95% CI Lower',
					data: data.confidence_band_lower,
					showSymbol: false,
					lineStyle: { color: confColor, width: 1.5, type: 'dashed' as const, opacity: 0.7 },
					itemStyle: { color: confColor },
					z: 3,
				},
				// Prediction band upper
				{
					type: 'line' as const,
					name: '95% PI Upper',
					data: data.prediction_band_upper,
					showSymbol: false,
					lineStyle: { color: predColor, width: 1, type: 'dotted' as const, opacity: 0.5 },
					itemStyle: { color: predColor },
					z: 2,
				},
				// Prediction band lower
				{
					type: 'line' as const,
					name: '95% PI Lower',
					data: data.prediction_band_lower,
					showSymbol: false,
					lineStyle: { color: predColor, width: 1, type: 'dotted' as const, opacity: 0.5 },
					itemStyle: { color: predColor },
					z: 2,
				},
			],
			legend: {
				show: true,
				bottom: 0,
				textStyle: { color: axisLabelColor, fontSize: 11 },
				data: ['Data', 'Regression', '95% CI Upper', '95% PI Upper'],
			},
		}
	}, [data, isDark])

	const { containerRef } = useECharts({ option })

	if (!data?.points || data.points.length === 0) {
		return (
			<div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
				No regression data available
			</div>
		)
	}

	return <div ref={containerRef} className="h-[400px] w-full" />
}
