/**
 * ECharts tree-shaken registration module.
 *
 * Only imports the components we actually use to minimize bundle size.
 * All chart components should import from this module instead of 'echarts' directly.
 */

import { use as registerECharts, graphic, init } from 'echarts/core'
import { LineChart, BarChart, CustomChart, ScatterChart, HeatmapChart } from 'echarts/charts'
import type { LineSeriesOption, BarSeriesOption, CustomSeriesOption, ScatterSeriesOption, HeatmapSeriesOption } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  VisualMapContinuousComponent,
} from 'echarts/components'
import type {
  GridComponentOption,
  TooltipComponentOption,
  MarkLineComponentOption,
  MarkAreaComponentOption,
  MarkPointComponentOption,
  DataZoomComponentOption,
  DatasetComponentOption,
  GraphicComponentOption,
  VisualMapComponentOption,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'

// Register all required components once
registerECharts([
  CanvasRenderer,
  LineChart,
  BarChart,
  CustomChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  VisualMapContinuousComponent,
])

// Compose the option type for our charts
export type ECOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | CustomSeriesOption
  | ScatterSeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | MarkPointComponentOption
  | DataZoomComponentOption
  | DatasetComponentOption
  | GraphicComponentOption
  | VisualMapComponentOption
>

// Re-export what chart components need
export { init, graphic }
export type { LineSeriesOption, BarSeriesOption, CustomSeriesOption, ScatterSeriesOption, HeatmapSeriesOption }

// Type aliases for custom renderItem functions — avoids `any` in chart components
export type RenderItemParams = Parameters<NonNullable<CustomSeriesOption['renderItem']>>[0]
export type RenderItemAPI = Parameters<NonNullable<CustomSeriesOption['renderItem']>>[1]
