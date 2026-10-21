'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Competition, Page, Prediction } from '@/lib/types';
import { shortId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, PageHeading, PredictionTable } from '@/components/common';
import { BatchHistoryTable } from '@/components/batch-history-table';

export default function HistoryPage() {
  const [tab, setTab] = useState<'batches' | 'predictions'>('batches'); const [search, setSearch] = useState(''); const [competition, setCompetition] = useState(''); const [page, setPage] = useState(1); const [compare, setCompare] = useState<string[]>([]);
  const competitions = useQuery({ queryKey: ['competitions'], queryFn: () => api<Competition[]>('/competitions') });
  const batches = useQuery({ queryKey: ['batches', page], queryFn: () => api<Page<Batch>>(`/prediction-batches?page=${page}&limit=20`) });
  const params = new URLSearchParams({ page: String(page), limit: '20', ...(search ? { search } : {}), ...(competition ? { competition } : {}) });
  const predictions = useQuery({ queryKey: ['predictions', params.toString()], queryFn: () => api<Page<Prediction>>(`/predictions?${params}`), enabled: tab === 'predictions' });
  return <><PageHeading title="Prediction history" description="Inspect every batch and preserved prediction version." /><div className="flex gap-2 border-b border-border"><button className={`px-4 py-3 text-sm font-semibold ${tab === 'batches' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`} onClick={() => { setTab('batches'); setPage(1); }}>Batches</button><button className={`px-4 py-3 text-sm font-semibold ${tab === 'predictions' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`} onClick={() => { setTab('predictions'); setPage(1); }}>All predictions</button></div>
    {tab === 'batches' ? <>{compare.length === 2 && <Card className="flex flex-wrap items-center gap-4 p-4 text-sm"><span className="font-semibold">Compare batches</span><span className="font-mono text-xs">{shortId(compare[0]!)} vs {shortId(compare[1]!)}</span><Button size="sm" variant="secondary" asChild><Link href={`/predictions/batches/${compare[0]}?compare=${compare[1]}`}>Open comparison <ArrowRight size={14} /></Link></Button><Button size="sm" variant="ghost" onClick={() => setCompare([])}>Clear</Button></Card>}{batches.isError ? <ErrorState error={batches.error} retry={() => batches.refetch()} /> : batches.data?.items.length ? <BatchHistoryTable rows={batches.data.items} compare={compare} onCompare={(id, checked) => setCompare(checked ? [...compare.slice(-1), id] : compare.filter((item) => item !== id))} /> : <EmptyState title="No batches yet" description="Your generated prediction batches will appear here." action={<Button asChild><Link href="/predictions/generate">Generate predictions</Link></Button>} />}</> : <><Card className="grid gap-3 p-4 sm:grid-cols-[1fr_240px]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input className="pl-9" placeholder="Search by team" aria-label="Search by team" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div><Select aria-label="Competition" value={competition} onChange={(e) => { setCompetition(e.target.value); setPage(1); }}><option value="">All competitions</option>{competitions.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Card>{predictions.isError ? <ErrorState error={predictions.error} retry={() => predictions.refetch()} /> : predictions.data?.items.length ? <PredictionTable rows={predictions.data.items.filter((p) => p.fixture).map((prediction) => ({ fixture: prediction.fixture!, prediction }))} interactive pageScoped /> : <EmptyState title="No predictions found" description="Try another search or generate a prediction batch." />}</>}
    <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Page {page} · {tab === 'batches' ? batches.data?.total ?? 0 : predictions.data?.total ?? 0} records</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page * 20 >= (tab === 'batches' ? batches.data?.total ?? 0 : predictions.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></div></div>
  </>;
}
