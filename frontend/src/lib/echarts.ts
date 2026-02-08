/**
 * ECharts tree-shaken registration module.
 *
 * Only imports the components we actually use to minimize bundle size.
 * All chart components should import from this module instead of 'echarts' directly.
 */

import { use as registerECharts, graphic, init } from 'echarts/core'
import { LineChart, BarChart, CustomChart } from 'echarts/charts'
import type { LineSeriesOption, BarSeriesOption, CustomSeriesOption } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
} from 'echarts/components'
import type {
  GridComponentOption,
  TooltipComponentOption,
  MarkLineComponentOption,
  MarkAreaComponentOption,
  MarkPointComponentOption,
  DataZoomComponentOption,
  DatasetComponentOption,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'

// Register all required components once
registerECharts([
  CanvasRenderer,
  LineChart,
  BarChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
])

// Compose the option type for our charts
export type ECOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | CustomSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | MarkPointComponentOption
  | DataZoomComponentOption
  | DatasetComponentOption
>

// Re-export what chart components need
export { init, graphic }
export type { LineSeriesOption, BarSeriesOption, CustomSeriesOption }
