'use client';

import type { Fixture, Outcome, Prediction } from '@/lib/types';
import { percent } from '@/lib/utils';
import { DataTable, type DataColumn, type DataFilter } from '@/components/data-table';
import { outcomeLabel } from '@/components/common';

interface Item {
  fixture: Fixture;
  prediction: Prediction | null;
}
interface Match {
  current: Item;
  other: Item;
}

export function BatchComparisonTable({ rows }: { rows: Match[] }) {
  const outcome = (prediction: Prediction | null) => prediction?.predictedOutcome ?? 'NONE';
  const probability = (prediction: Prediction | null, key: Outcome) =>
    prediction?.probabilities?.[key] ?? null;
  const columns: DataColumn<Match>[] = [
    {
      id: 'fixture',
      heading: 'Fixture',
      value: ({ current }) =>
        `${current.fixture.homeTeam.name} vs ${current.fixture.awayTeam.name}`,
      cell: ({ current }) => (
        <span className="whitespace-nowrap">
          {current.fixture.homeTeam.name} vs {current.fixture.awayTeam.name}
        </span>
      ),
    },
    {
      id: 'currentOutcome',
      heading: 'Current outcome',
      value: ({ current }) => outcome(current.prediction),
      cell: ({ current }) =>
        current.prediction?.predictedOutcome
          ? outcomeLabel[current.prediction.predictedOutcome]
          : '—',
    },
    {
      id: 'otherOutcome',
      heading: 'Other outcome',
      value: ({ other }) => outcome(other.prediction),
      cell: ({ other }) =>
        other.prediction?.predictedOutcome ? outcomeLabel[other.prediction.predictedOutcome] : '—',
    },
    ...(['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const).map((key) => ({
      id: `current-${key}`,
      heading: `Current ${key === 'HOME_WIN' ? 'home' : key === 'DRAW' ? 'draw' : 'away'} %`,
      value: ({ current }: Match) => probability(current.prediction, key),
      cell: ({ current }: Match) => percent(probability(current.prediction, key)),
    })),
    ...(['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const).map((key) => ({
      id: `other-${key}`,
      heading: `Other ${key === 'HOME_WIN' ? 'home' : key === 'DRAW' ? 'draw' : 'away'} %`,
      value: ({ other }: Match) => probability(other.prediction, key),
      cell: ({ other }: Match) => percent(probability(other.prediction, key)),
    })),
  ];
  const filters: DataFilter<Match>[] = [
    {
      id: 'currentOutcome',
      label: 'current outcomes',
      value: ({ current }) => outcome(current.prediction),
    },
    {
      id: 'otherOutcome',
      label: 'other outcomes',
      value: ({ other }) => outcome(other.prediction),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      filters={filters}
      rowKey={({ current }) => current.fixture.id}
      searchPlaceholder="Search comparison fixtures"
      searchText={({ current }) =>
        `${current.fixture.homeTeam.name} ${current.fixture.awayTeam.name} ${current.fixture.competition.name}`
      }
      defaultSort={{ id: 'fixture', direction: 'asc' }}
      pageScoped
    />
  );
}
