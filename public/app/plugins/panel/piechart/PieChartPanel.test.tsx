import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { ComponentProps } from 'react';

import { FieldConfigSource, toDataFrame, FieldType, VizOrientation } from '@grafana/data';
import { LegendDisplayMode, SortOrder, TooltipDisplayMode } from '@grafana/schema';

import { PieChartPanel } from './PieChartPanel';
import { PieChartOptions, PieChartType, PieChartLegendValues } from './types';

(window as any).ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  disconnect() {}
};

type PieChartPanelProps = ComponentProps<typeof PieChartPanel>;

describe('PieChartPanel', () => {
  describe('series overrides - Hide in area', () => {
    const defaultConfig = {
      custom: {
        hideFrom: {
          legend: false,
          viz: false,
          tooltip: false,
        },
      },
    };

    describe('when no hiding', () => {
      const seriesWithNoOverrides = [
        toDataFrame({
          fields: [
            { name: 'Chrome', config: defaultConfig, type: FieldType.number, values: [60] },
            { name: 'Firefox', config: defaultConfig, type: FieldType.number, values: [20] },
            { name: 'Safari', config: defaultConfig, type: FieldType.number, values: [20] },
          ],
        }),
      ];

      it('should not filter out any slices or legend items', () => {
        setup({ data: { series: seriesWithNoOverrides } });

        const slices = screen.queryAllByLabelText('Pie Chart Slice');
        expect(slices.length).toBe(3);
        expect(screen.queryByText(/Chrome/i)).toBeInTheDocument();
        expect(screen.queryByText(/Firefox/i)).toBeInTheDocument();
        expect(screen.queryByText(/Safari/i)).toBeInTheDocument();
      });
    });

    describe('when series override to hide viz', () => {
      const hideVizConfig = {
        custom: {
          hideFrom: {
            legend: false,
            viz: true,
            tooltip: false,
          },
        },
      };

      const seriesWithFirefoxOverride = [
        toDataFrame({
          fields: [
            { name: 'Chrome', config: defaultConfig, type: FieldType.number, values: [60] },
            { name: 'Firefox', config: hideVizConfig, type: FieldType.number, values: [20] },
            { name: 'Safari', config: defaultConfig, type: FieldType.number, values: [20] },
          ],
        }),
      ];

      it('should filter out the Firefox pie chart slice but not the legend', () => {
        setup({ data: { series: seriesWithFirefoxOverride } });

        const slices = screen.queryAllByLabelText('Pie Chart Slice');
        expect(slices.length).toBe(2);
        expect(screen.queryByText(/Firefox/i)).toBeInTheDocument();
      });
    });

    describe('when series override to hide legend', () => {
      const hideLegendConfig = {
        custom: {
          hideFrom: {
            legend: true,
            viz: false,
            tooltip: false,
          },
        },
      };

      const seriesWithFirefoxOverride = [
        toDataFrame({
          fields: [
            { name: 'Chrome', config: defaultConfig, type: FieldType.number, values: [60] },
            { name: 'Firefox', config: hideLegendConfig, type: FieldType.number, values: [20] },
            { name: 'Safari', config: defaultConfig, type: FieldType.number, values: [20] },
          ],
        }),
      ];

      it('should filter out the series from the legend but not the slice', () => {
        setup({ data: { series: seriesWithFirefoxOverride } });

        expect(screen.queryByText(/Firefox/i)).not.toBeInTheDocument();
        const slices = screen.queryAllByLabelText('Pie Chart Slice');
        expect(slices.length).toBe(3);
      });
    });
  });
});

const setup = (propsOverrides?: {}) => {
  const fieldConfig: FieldConfigSource = {
    defaults: {},
    overrides: [],
  };

  const options: PieChartOptions = {
    pieType: PieChartType.Pie,
    displayLabels: [],
    legend: {
      displayMode: LegendDisplayMode.List,
      placement: 'right',
      calcs: [],
      values: [PieChartLegendValues.Percent],
    },
    reduceOptions: {
      calcs: [],
    },
    orientation: VizOrientation.Auto,
    tooltip: { mode: TooltipDisplayMode.Multi, sort: SortOrder.Ascending },
  };

  const props = {
    id: 1,
    data: {},
    timeZone: 'utc',
    options: options,
    fieldConfig: fieldConfig,
    width: 532,
    height: 250,
    replaceVariables: (s: any) => s,
    ...propsOverrides,
  } as unknown as PieChartPanelProps;

  return render(<PieChartPanel {...props} />);
};
