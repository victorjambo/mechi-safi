'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Competition, Fixture, Page } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, PageHeading, PredictionTable } from '@/components/common';

export default function FixturesPage() {
  const [competition, setCompetition] = useState(''); const [date, setDate] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [page, setPage] = useState(1);
  const competitions = useQuery({ queryKey: ['competitions'], queryFn: () => api<Competition[]>('/competitions') });
  const params = new URLSearchParams({ page: String(page), limit: '20', ...(competition ? { competition } : {}), ...(date ? { date } : {}), ...(search ? { search } : {}), ...(status !== 'all' ? { predictionStatus: status } : {}) });
  const fixtures = useQuery({ queryKey: ['fixtures', params.toString()], queryFn: () => api<Page<Fixture>>(`/fixtures?${params}`) });
  const predict = useMutation({ mutationFn: (fixtureId: string) => post<{ batchId: string }>(`/admin/predictions/${fixtureId}/run`), onSuccess: () => fixtures.refetch() });
  return <><PageHeading title="Upcoming fixtures" description="Browse scheduled matches and generate an individual prediction when needed." /><Card className="grid gap-3 p-4 md:grid-cols-[1fr_180px_160px_180px]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Search teams" placeholder="Search teams" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div><Select aria-label="Competition" value={competition} onChange={(e) => { setCompetition(e.target.value); setPage(1); }}><option value="">All competitions</option>{competitions.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input aria-label="Kickoff date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} /><Select aria-label="Prediction status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="all">All prediction states</option><option value="predicted">Predicted</option><option value="unpredicted">Not predicted</option></Select></Card>
    {fixtures.isError ? <ErrorState error={fixtures.error} retry={() => fixtures.refetch()} /> : fixtures.data?.items.length ? <><PredictionTable rows={fixtures.data.items.map((fixture) => ({ fixture, prediction: fixture.latestPrediction }))} /><Card className="p-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{fixtures.data.total} fixtures · Page {page}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page * 20 >= fixtures.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div></Card><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fixtures.data.items.filter((fixture) => !fixture.latestPrediction).map((fixture) => <Card key={fixture.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><Link href={`/fixtures/${fixture.id}`} className="block truncate text-sm font-semibold hover:text-primary">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</Link><div className="text-xs text-muted-foreground">No prediction yet</div></div><Button size="sm" variant="secondary" disabled={predict.isPending} onClick={() => predict.mutate(fixture.id)}><Sparkles size={14} /> Predict</Button></Card>)}</div></> : <EmptyState title="No fixtures found" description="Try different filters or sync the provider from Settings." />}{predict.error && <p role="alert" className="text-sm text-red-600">{predict.error.message}</p>}
  </>;
}
