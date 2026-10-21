'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type CellValue = string | number | null | undefined;
export interface DataColumn<Row> {
  id: string;
  heading: string;
  value: (row: Row) => CellValue;
  cell: (row: Row) => ReactNode;
  sortable?: boolean;
  sortLabel?: string;
}
export interface DataFilter<Row> {
  id: string;
  label: string;
  value: (row: Row) => string | null | undefined;
}

function compareValues(left: CellValue, right: CellValue, direction: 'asc' | 'desc') {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

export function DataTable<Row>({ rows, columns, filters = [], rowKey, searchPlaceholder = 'Search rows', searchText, defaultSort, pageScoped = false }: {
  rows: Row[];
  columns: DataColumn<Row>[];
  filters?: DataFilter<Row>[];
  rowKey: (row: Row) => string;
  searchPlaceholder?: string;
  searchText?: (row: Row) => string;
  defaultSort?: { id: string; direction: 'asc' | 'desc' };
  pageScoped?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [sortId, setSortId] = useState(defaultSort?.id ?? '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc');
  const filterOptions = useMemo(() => Object.fromEntries(filters.map((filter) => {
    const selected = selectedFilters[filter.id];
    const values = rows.map((row) => filter.value(row)).filter((value): value is string => !!value);
    if (selected) values.push(selected);
    return [filter.id, [...new Set(values)].sort((a, b) => a.localeCompare(b))];
  })) as Record<string, string[]>, [rows, filters, selectedFilters]);
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) => {
      const text = searchText?.(row) ?? columns.map((column) => column.value(row) ?? '').join(' ');
      return (!term || text.toLocaleLowerCase().includes(term)) && filters.every((filter) => !selectedFilters[filter.id] || filter.value(row) === selectedFilters[filter.id]);
    });
    const column = columns.find((item) => item.id === sortId);
    if (!column) return filtered;
    return filtered.map((row, index) => ({ row, index })).sort((a, b) => compareValues(column.value(a.row), column.value(b.row), sortDirection) || a.index - b.index).map(({ row }) => row);
  }, [rows, columns, filters, search, searchText, selectedFilters, sortId, sortDirection]);
  const changed = !!search || Object.values(selectedFilters).some(Boolean) || sortId !== (defaultSort?.id ?? '') || sortDirection !== (defaultSort?.direction ?? 'asc');
  const reset = () => { setSearch(''); setSelectedFilters({}); setSortId(defaultSort?.id ?? ''); setSortDirection(defaultSort?.direction ?? 'asc'); };
  const sort = (id: string) => { if (sortId === id) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); else { setSortId(id); setSortDirection('asc'); } };
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center gap-3 border-b border-border p-4" role="group" aria-label="Table filters">
      <div className="relative min-w-52 flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
      {filters.map((filter) => <Select key={filter.id} aria-label={`Filter ${filter.label}`} value={selectedFilters[filter.id] ?? ''} onChange={(event) => setSelectedFilters((current) => ({ ...current, [filter.id]: event.target.value }))} className="w-full sm:w-44"><option value="">All {filter.label.toLocaleLowerCase()}</option>{filterOptions[filter.id]?.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select>)}
      <Button variant="ghost" size="sm" disabled={!changed} onClick={reset}>Reset</Button>
    </div>
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground" role="status"><span>Showing {visibleRows.length} of {rows.length} rows{pageScoped ? ' on this page' : ''}</span><span>Click a column heading to sort</span></div>
    <Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column.id} aria-sort={column.sortable === false ? undefined : sortId === column.id ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>{column.sortable === false ? column.heading : <button type="button" className="inline-flex items-center gap-1.5 rounded-sm hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => sort(column.id)} aria-label={`Sort by ${column.sortLabel ?? column.heading}${sortId === column.id ? `, ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}><span>{column.heading}</span>{sortId === column.id ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button>}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{visibleRows.length ? visibleRows.map((row) => <TableRow key={rowKey(row)}>{columns.map((column) => <TableCell key={column.id}>{column.cell(row)}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">No rows match these filters.</TableCell></TableRow>}</TableBody>
    </Table>
  </Card>;
}
