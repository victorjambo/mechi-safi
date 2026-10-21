'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, AlertCircle, Search } from 'lucide-react';
import type { Fixture, Prediction, Probabilities, Outcome } from '@/lib/types';
import { formatDate, percent } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PageHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold tracking-tight lg:text-[28px]">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>; }
export function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail?: string; icon?: React.ReactNode }) { return <Card className="p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span>{icon}</div><div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</Card>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <Card className="flex items-center gap-3 border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle size={18} /><span>{error instanceof Error ? error.message : 'Something went wrong'}</span>{retry && <Button variant="secondary" size="sm" className="ml-auto" onClick={retry}>Retry</Button>}</Card>; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <Card className="flex flex-col items-center px-6 py-14 text-center"><div className="mb-4 rounded-full bg-indigo-50 p-3 text-primary"><AlertCircle size={22} /></div><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</Card>; }
export function LoadingCards() { return <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>; }
export function StatusBadge({ status }: { status: string }) { const tone = ['COMPLETED', 'GENERATED', 'SUCCEEDED', 'PREDICTED', 'EVALUATED'].includes(status) ? 'border-green-200 bg-green-50 text-green-700' : status === 'RUNNING' || status === 'QUEUED' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : status === 'FAILED' || status === 'COMPLETED_WITH_ERRORS' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'; return <Badge className={tone}>{status.replaceAll('_', ' ')}</Badge>; }
export function TeamName({ name, crest }: { name: string; crest?: string | null }) { return <span className="inline-flex items-center gap-2 whitespace-nowrap">{crest ? <Image src={crest} alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>}<span>{name}</span></span>; }
export const outcomeLabel: Record<Outcome, string> = { HOME_WIN: 'Home win', DRAW: 'Draw', AWAY_WIN: 'Away win' };
export function ProbabilityBars({ probabilities, compact = false }: { probabilities: Probabilities | null; compact?: boolean }) { if (!probabilities) return <span className="text-muted-foreground">—</span>; const entries: [Outcome, string][] = [['HOME_WIN', '1'], ['DRAW', 'X'], ['AWAY_WIN', '2']]; const max = Math.max(...entries.map(([key]) => probabilities[key])); return <div className={compact ? 'flex min-w-40 gap-1' : 'grid gap-2'}>{entries.map(([key, label]) => <div key={key} className={compact ? 'flex-1' : 'flex items-center gap-3'}><span className={compact ? 'block text-[10px] text-muted-foreground' : 'w-16 text-xs text-muted-foreground'}>{compact ? label : outcomeLabel[key]}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={probabilities[key] === max ? 'h-full rounded-full bg-primary' : 'h-full rounded-full bg-slate-300'} style={{ width: `${probabilities[key] * 100}%` }} /></div><span className={compact ? 'block text-[10px] font-semibold' : 'w-10 text-right text-xs font-semibold'}>{percent(probabilities[key])}</span></div>)}</div>; }
type PredictionTableRow = { fixture: Fixture; prediction: Prediction | null; status?: string; reason?: string | null };
type SortKey = 'kickoff' | 'competition' | 'homeTeam' | 'awayTeam' | 'homeProbability' | 'drawProbability' | 'awayProbability' | 'prediction' | 'status';
type SortDirection = 'asc' | 'desc';

function tableStatus(row: PredictionTableRow) {
  if (row.status && row.status !== 'GENERATED') return row.status;
  if (row.prediction?.evaluation) return 'EVALUATED';
  if (row.status === 'GENERATED' || row.prediction?.status === 'SUCCEEDED') return 'PREDICTED';
  return row.status ?? row.prediction?.status ?? 'PENDING';
}

function sortValue(row: PredictionTableRow, key: SortKey): string | number | null {
  switch (key) {
    case 'kickoff': return row.fixture.kickoff;
    case 'competition': return row.fixture.competition.name;
    case 'homeTeam': return row.fixture.homeTeam.name;
    case 'awayTeam': return row.fixture.awayTeam.name;
    case 'homeProbability': return row.prediction?.probabilities?.HOME_WIN ?? null;
    case 'drawProbability': return row.prediction?.probabilities?.DRAW ?? null;
    case 'awayProbability': return row.prediction?.probabilities?.AWAY_WIN ?? null;
    case 'prediction': return row.prediction?.predictedOutcome ? outcomeLabel[row.prediction.predictedOutcome] : null;
    case 'status': return tableStatus(row);
  }
}

export function PredictionTable({ rows, timezone, interactive = false }: { rows: PredictionTableRow[]; timezone?: string; interactive?: boolean }) {
  const [search, setSearch] = useState('');
  const [competition, setCompetition] = useState('');
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('kickoff');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const competitions = useMemo(() => [...new Map(rows.map(({ fixture }) => [fixture.competition.id, fixture.competition.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const statuses = useMemo(() => [...new Set([...rows.map(tableStatus), ...(status ? [status] : [])])].sort(), [rows, status]);
  const visibleRows = useMemo(() => {
    if (!interactive) return rows;
    const term = search.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) => {
      const matchesSearch = !term || [row.fixture.homeTeam.name, row.fixture.awayTeam.name, row.fixture.competition.name].some((value) => value.toLocaleLowerCase().includes(term));
      return matchesSearch && (!competition || row.fixture.competition.id === competition) && (!status || tableStatus(row) === status) && (!outcome || (outcome === 'NONE' ? !row.prediction?.predictedOutcome : row.prediction?.predictedOutcome === outcome));
    });
    return filtered.sort((a, b) => {
      const left = sortValue(a, sortKey); const right = sortValue(b, sortKey);
      if (left === null) return right === null ? a.fixture.id.localeCompare(b.fixture.id) : 1;
      if (right === null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
      return (sortDirection === 'asc' ? comparison : -comparison) || a.fixture.id.localeCompare(b.fixture.id);
    });
  }, [rows, interactive, search, competition, status, outcome, sortKey, sortDirection]);
  const hasChanges = search || competition || status || outcome || sortKey !== 'kickoff' || sortDirection !== 'asc';
  const reset = () => { setSearch(''); setCompetition(''); setStatus(''); setOutcome(''); setSortKey('kickoff'); setSortDirection('asc'); };
  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDirection('asc'); } };
  const heading = (label: string, key: SortKey) => <TableHead aria-sort={interactive ? sortKey === key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>{interactive ? <button type="button" className="inline-flex items-center gap-1.5 rounded-sm hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => toggleSort(key)} aria-label={`Sort by ${label}${sortKey === key ? `, ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}><span>{label}</span>{sortKey === key ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button> : label}</TableHead>;
  const probabilityCell = (prediction: Prediction | null, key: Outcome) => {
    const value = prediction?.probabilities?.[key];
    if (value === undefined) return <span className="text-muted-foreground">—</span>;
    const max = Math.max(...Object.values(prediction!.probabilities!));
    return <div className={`min-w-14 text-xs font-semibold ${value === max ? 'text-primary' : 'text-slate-600'}`}><span>{percent(value)}</span><div className="mt-1 h-1 w-14 rounded-full bg-slate-100"><div className={`h-full rounded-full ${value === max ? 'bg-primary' : 'bg-slate-300'}`} style={{ width: `${value * 100}%` }} /></div></div>;
  };
  return <Card className="overflow-hidden">
    {interactive && <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_180px_150px_150px_auto]" role="group" aria-label="Fixture and prediction filters">
      <div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Search table teams or competition" placeholder="Search teams or competition" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
      <Select aria-label="Filter table competition" value={competition} onChange={(event) => setCompetition(event.target.value)}><option value="">All competitions</option>{competitions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
      <Select aria-label="Filter table status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select>
      <Select aria-label="Filter table outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All outcomes</option><option value="HOME_WIN">Home win</option><option value="DRAW">Draw</option><option value="AWAY_WIN">Away win</option><option value="NONE">No prediction</option></Select>
      <Button variant="ghost" size="sm" disabled={!hasChanges} onClick={reset}>Reset</Button>
    </div>}
    {interactive && <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground" role="status"><span>Showing {visibleRows.length} of {rows.length} rows</span><span>Click a column heading to sort</span></div>}
    <Table><TableHeader><TableRow>{heading('Kickoff', 'kickoff')}{heading('Competition', 'competition')}{heading('Home team', 'homeTeam')}{heading('Away team', 'awayTeam')}{heading('Home %', 'homeProbability')}{heading('Draw %', 'drawProbability')}{heading('Away %', 'awayProbability')}{heading('Prediction', 'prediction')}{heading('Status', 'status')}<TableHead></TableHead></TableRow></TableHeader>
      <TableBody>{visibleRows.length ? visibleRows.map((row) => {
        const { fixture, prediction, reason } = row;
        return <TableRow key={`${fixture.id}-${prediction?.id ?? row.status}`}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(fixture.kickoff, timezone)}</TableCell><TableCell className="whitespace-nowrap">{fixture.competition.name}</TableCell><TableCell><TeamName name={fixture.homeTeam.name} crest={fixture.homeTeam.crest} /></TableCell><TableCell><TeamName name={fixture.awayTeam.name} crest={fixture.awayTeam.crest} /></TableCell><TableCell>{probabilityCell(prediction, 'HOME_WIN')}</TableCell><TableCell>{probabilityCell(prediction, 'DRAW')}</TableCell><TableCell>{probabilityCell(prediction, 'AWAY_WIN')}</TableCell><TableCell className="font-medium">{prediction?.predictedOutcome ? outcomeLabel[prediction.predictedOutcome] : '—'}</TableCell><TableCell><StatusBadge status={tableStatus(row)} />{reason && <div className="mt-1 max-w-48 text-xs text-red-600">{reason}</div>}</TableCell><TableCell>{prediction ? <Link href={`/predictions/${prediction.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Details <ArrowRight size={13} /></Link> : <Link href={`/fixtures/${fixture.id}`} className="text-xs font-semibold text-primary hover:underline">Fixture</Link>}</TableCell></TableRow>;
      }) : <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No rows match these filters.</TableCell></TableRow>}</TableBody>
    </Table>
  </Card>;
}
