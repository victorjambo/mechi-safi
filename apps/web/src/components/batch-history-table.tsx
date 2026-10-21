'use client';

import Link from 'next/link';
import type { Batch } from '@/lib/types';
import { formatDate, percent, shortId } from '@/lib/utils';
import { DataTable, type DataColumn, type DataFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/common';

export function BatchHistoryTable({ rows, compare, onCompare }: { rows: Batch[]; compare: string[]; onCompare: (id: string, checked: boolean) => void }) {
  const columns: DataColumn<Batch>[] = [
    { id: 'compare', heading: 'Compare', value: () => null, sortable: false, cell: (batch) => <input aria-label={`Compare batch ${batch.id}`} type="checkbox" checked={compare.includes(batch.id)} onChange={(event) => onCompare(batch.id, event.target.checked)} /> },
    { id: 'id', heading: 'Batch', value: (batch) => batch.id, cell: (batch) => <span className="font-mono text-xs">{shortId(batch.id)}</span> },
    { id: 'createdAt', heading: 'Created', value: (batch) => batch.createdAt, cell: (batch) => <span className="whitespace-nowrap">{formatDate(batch.createdAt)}</span> },
    { id: 'model', heading: 'Model', value: (batch) => batch.config?.model ?? null, cell: (batch) => batch.config?.model ?? '—' },
    { id: 'periodHours', heading: 'Window', value: (batch) => batch.periodHours, cell: (batch) => `${batch.periodHours}h` },
    { id: 'totalFixtures', heading: 'Fixtures', value: (batch) => batch.totalFixtures, cell: (batch) => batch.totalFixtures },
    { id: 'generatedCount', heading: 'Generated', value: (batch) => batch.generatedCount, cell: (batch) => batch.generatedCount },
    { id: 'completedResults', heading: 'Results', value: (batch) => batch.completedResults ?? 0, cell: (batch) => batch.completedResults ?? 0 },
    { id: 'accuracy', heading: 'Accuracy', value: (batch) => batch.accuracy ?? null, cell: (batch) => percent(batch.accuracy) },
    { id: 'failedCount', heading: 'Failed', value: (batch) => batch.failedCount, cell: (batch) => batch.failedCount },
    { id: 'status', heading: 'Status', value: (batch) => batch.status, cell: (batch) => <StatusBadge status={batch.status} /> },
    { id: 'view', heading: 'View', value: () => null, sortable: false, cell: (batch) => <Link href={`/predictions/batches/${batch.id}`} className="font-semibold text-primary">View</Link> },
  ];
  const filters: DataFilter<Batch>[] = [
    { id: 'status', label: 'statuses', value: (batch) => batch.status },
    { id: 'model', label: 'models', value: (batch) => batch.config?.model },
  ];
  return <DataTable rows={rows} columns={columns} filters={filters} rowKey={(batch) => batch.id} searchPlaceholder="Search batches" searchText={(batch) => `${batch.id} ${batch.config?.model ?? ''} ${batch.status}`} defaultSort={{ id: 'createdAt', direction: 'desc' }} pageScoped />;
}
