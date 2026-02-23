/**
 * ECharts tree-shaken registration module.
 *
 * Only imports the components we actually use to minimize bundle size.
 * All chart components should import from this module instead of 'echarts' directly.
 */

import { use as registerECharts, graphic, init } from 'echarts/core'
import { LineChart, BarChart, CustomChart, ScatterChart } from 'echarts/charts'
import type { LineSeriesOption, BarSeriesOption, CustomSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
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
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
])

// Compose the option type for our charts
export type ECOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | CustomSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | MarkPointComponentOption
  | DataZoomComponentOption
  | DatasetComponentOption
  | GraphicComponentOption
>

// Re-export what chart components need
export { init, graphic }
export type { LineSeriesOption, BarSeriesOption, CustomSeriesOption, ScatterSeriesOption }
