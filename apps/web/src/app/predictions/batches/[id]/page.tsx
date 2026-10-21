'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, XCircle } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Batch, Fixture, Page, Prediction } from '@/lib/types';
import { batchProgress } from '@/lib/progress';
import { formatDate, percent, shortId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, Metric, PageHeading, PredictionTable, StatusBadge } from '@/components/common';

interface Item { fixture: Fixture; prediction: Prediction | null; status: string; reason: string | null }
export default function BatchDetail() {
  const id = useParams<{ id: string }>().id; const compareId = useSearchParams().get('compare');
  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => api<Batch>(`/prediction-batches/${id}`), refetchInterval: (query) => ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 2000 : false });
  const items = useQuery({ queryKey: ['batchItems', id], queryFn: () => api<Page<Item>>(`/prediction-batches/${id}/predictions?limit=100`), refetchInterval: batch.data && ['QUEUED', 'RUNNING'].includes(batch.data.status) ? 2000 : false });
  const comparison = useQuery({ queryKey: ['batch', compareId], queryFn: () => api<Batch>(`/prediction-batches/${compareId}`), enabled: !!compareId });
  const comparisonItems = useQuery({ queryKey: ['batchItems', compareId], queryFn: () => api<Page<Item>>(`/prediction-batches/${compareId}/predictions?limit=100`), enabled: !!compareId });
  const retry = useMutation({ mutationFn: () => post(`/prediction-batches/${id}/retry`), onSuccess: () => { batch.refetch(); items.refetch(); } });
  const cancel = useMutation({ mutationFn: () => post(`/prediction-batches/${id}/cancel`), onSuccess: () => batch.refetch() });
  if (batch.isError) return <ErrorState error={batch.error} retry={() => batch.refetch()} />;
  const row = batch.data;
  const matching = items.data?.items.flatMap((item) => {
    const other = comparisonItems.data?.items.find((candidate) => candidate.fixture.id === item.fixture.id);
    return other ? [{ current: item, other }] : [];
  }) ?? [];
  return <><Link href="/predictions/history" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16} /> Prediction history</Link><PageHeading title={`Batch ${shortId(id)}`} description={row ? `Created ${formatDate(row.createdAt)} · ${row.periodHours} hour window` : 'Loading batch…'} action={row && <StatusBadge status={row.status} />} />{row && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Fixtures" value={row.totalFixtures} /><Metric label="Generated" value={row.generatedCount} /><Metric label="Skipped" value={row.skippedCount} /><Metric label="Failed" value={row.failedCount} /></div><Card><CardContent className="space-y-4 pt-6"><div className="flex justify-between text-sm"><span>Progress</span><strong>{batchProgress(row)}%</strong></div><Progress value={batchProgress(row)} /><div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>Window: {formatDate(row.windowStart)} – {formatDate(row.windowEnd)}</span><span>Model: {row.config?.model ?? '—'} · {row.config?.featureSetVersion ?? '—'}</span></div><div className="flex gap-2">{row.failedCount > 0 && <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}><RefreshCw size={14} /> Retry failed</Button>}{['QUEUED', 'RUNNING'].includes(row.status) && <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}><XCircle size={14} /> Cancel</Button>}</div></CardContent></Card>{comparison.data && <Card><CardHeader><CardTitle>Batch comparison</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><div><strong>{shortId(row.id)}</strong><p>{row.generatedCount} generated · {percent(row.accuracy)} accuracy ({row.completedResults ?? 0} results)</p></div><div><strong>{shortId(comparison.data.id)}</strong><p>{comparison.data.generatedCount} generated · {percent(comparison.data.accuracy)} accuracy ({comparison.data.completedResults ?? 0} results)</p></div></div>{matching.length ? <Table><TableHeader><TableRow><TableHead>Fixture</TableHead><TableHead>Current outcome</TableHead><TableHead>Other outcome</TableHead><TableHead>Current home/draw/away</TableHead><TableHead>Other home/draw/away</TableHead></TableRow></TableHeader><TableBody>{matching.map(({ current, other }) => <TableRow key={current.fixture.id}><TableCell>{current.fixture.homeTeam.name} vs {current.fixture.awayTeam.name}</TableCell><TableCell>{current.prediction?.predictedOutcome ?? '—'}</TableCell><TableCell>{other.prediction?.predictedOutcome ?? '—'}</TableCell><TableCell>{current.prediction?.probabilities ? Object.values(current.prediction.probabilities).map((value) => percent(value)).join(' / ') : '—'}</TableCell><TableCell>{other.prediction?.probabilities ? Object.values(other.prediction.probabilities).map((value) => percent(value)).join(' / ') : '—'}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">No overlapping fixtures in the first 100 batch items.</p>}</CardContent></Card>}<div><h3 className="mb-3 text-lg font-semibold">Fixtures and predictions</h3>{items.data?.items.length ? <PredictionTable rows={items.data.items} /> : <Card className="p-10 text-center text-sm text-muted-foreground">No fixture items yet. The worker is discovering the match window.</Card>}</div></>}</>;
}
