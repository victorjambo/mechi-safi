'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowRight, ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Batch, Competition, Fixture, Page, Prediction } from '@/lib/types';
import { batchProgress } from '@/lib/progress';
import { formatDate, shortId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  EmptyState,
  ErrorState,
  PageHeading,
  PredictionTable,
  StatusBadge,
} from '@/components/common';

const schema = z.object({
  period: z.string(),
  customHours: z.coerce.number().int().min(1).max(168).optional(),
  competitions: z.array(z.string()).min(1, 'Select at least one competition'),
  existingPredictionPolicy: z.enum(['SKIP', 'NEW_VERSION']),
  predictionConfigId: z.string().min(1),
});

type Form = z.infer<typeof schema>;

interface Settings {
  configs: { id: string; model: string; featureSetVersion: string }[];
}

interface BatchItem {
  fixture: Fixture;
  prediction: Prediction | null;
  status: string;
  reason: string | null;
}

export default function GeneratePage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    setBatchId(localStorage.getItem('currentBatchId'));
  }, []);
  const competitions = useQuery({
    queryKey: ['competitions'],
    queryFn: () => api<Competition[]>('/competitions'),
  });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      period: '24',
      competitions: [],
      existingPredictionPolicy: 'SKIP',
      predictionConfigId: 'default',
    },
  });
  useEffect(() => {
    if (competitions.data && !form.getValues('competitions').length)
      form.setValue(
        'competitions',
        competitions.data.filter((c) => c.available).map((c) => c.id),
      );
  }, [competitions.data, form]);
  const generate = useMutation({
    mutationFn: async (values: Form) =>
      post<Batch>(
        '/prediction-batches',
        {
          periodHours: values.period === 'custom' ? values.customHours : Number(values.period),
          competitions: values.competitions,
          existingPredictionPolicy: values.existingPredictionPolicy,
          predictionConfigId: values.predictionConfigId,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    onSuccess: (batch) => {
      setBatchId(batch.id);
      localStorage.setItem('currentBatchId', batch.id);
    },
  });
  const batch = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => api<Batch>(`/prediction-batches/${batchId}`),
    enabled: !!batchId,
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 2000 : false,
  });
  const results = useQuery({
    queryKey: ['batchResults', batchId],
    queryFn: () => api<Page<BatchItem>>(`/prediction-batches/${batchId}/predictions?limit=100`),
    enabled: !!batchId,
    refetchInterval: batch.data && ['QUEUED', 'RUNNING'].includes(batch.data.status) ? 2000 : false,
  });
  const retry = useMutation({
    mutationFn: () => post(`/prediction-batches/${batchId}/retry`),
    onSuccess: () => {
      batch.refetch();
      results.refetch();
    },
  });
  const selected = form.watch('competitions');
  const period = form.watch('period');
  const toggle = (id: string) =>
    form.setValue(
      'competitions',
      selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id],
      { shouldValidate: true },
    );
  const progress = batch.data ? batchProgress(batch.data) : 0;
  return (
    <>
      <PageHeading
        title="Generate Predictions"
        description="Run Jev on upcoming fixtures in a time window you choose."
      />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2 text-primary">
                <Sparkles size={20} />
              </div>
              <div>
                <CardTitle>Prediction configuration</CardTitle>
                <CardDescription>
                  All times are measured from when the API accepts your request.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((values) => generate.mutate(values))}
            >
              <div className="space-y-2">
                <Label htmlFor="period">Prediction period</Label>
                <Select id="period" {...form.register('period')}>
                  <option value="6">Next 6 hours</option>
                  <option value="12">Next 12 hours</option>
                  <option value="24">Next 24 hours</option>
                  <option value="48">Next 48 hours</option>
                  <option value="168">Next 7 days</option>
                  <option value="custom">Custom period</option>
                </Select>
                {period === 'custom' && (
                  <div className="pt-2">
                    <Label htmlFor="customHours">Hours (1–168)</Label>
                    <Input
                      id="customHours"
                      type="number"
                      min={1}
                      max={168}
                      {...form.register('customHours')}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Competitions</Label>
                  <span className="text-xs text-muted-foreground">{selected.length} selected</span>
                </div>
                {competitions.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading competitions…</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {competitions.data?.map((competition) => (
                      <label
                        key={competition.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${selected.includes(competition.id) ? 'border-indigo-300 bg-indigo-50/50' : 'border-border'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(competition.id)}
                          disabled={!competition.available}
                          onChange={() => toggle(competition.id)}
                          className="accent-[#635BFF]"
                        />
                        <span className="flex-1">{competition.name}</span>
                        {!competition.available && <Badge>Unavailable</Badge>}
                      </label>
                    ))}
                  </div>
                )}
                {form.formState.errors.competitions && (
                  <p role="alert" className="text-xs text-red-600">
                    {form.formState.errors.competitions.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy">Existing predictions</Label>
                <Select id="policy" {...form.register('existingPredictionPolicy')}>
                  <option value="SKIP">Skip existing predictions</option>
                  <option value="NEW_VERSION">Generate new prediction version</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Every new version keeps its own input snapshot and probabilities.
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-sm font-semibold"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced(!advanced)}
                >
                  Advanced options{' '}
                  <ChevronDown size={16} className={advanced ? 'rotate-180' : ''} />
                </button>
                {advanced && (
                  <div className="mt-4 space-y-3">
                    <Label htmlFor="model">Prediction model configuration</Label>
                    <Select id="model" {...form.register('predictionConfigId')}>
                      {settings.data?.configs.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.model} · {config.featureSetVersion}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Feature set and benchmark question are fixed by this configuration.
                    </p>
                  </div>
                )}
              </div>
              {generate.error && (
                <p role="alert" className="text-sm text-red-600">
                  {generate.error.message}
                </p>
              )}
              <Button
                size="lg"
                type="submit"
                disabled={generate.isPending || !competitions.data?.length}
                className="w-full sm:w-auto"
              >
                <Sparkles size={16} />
                {generate.isPending ? 'Creating batch…' : 'Generate Predictions'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Current batch</CardTitle>
              <CardDescription>Live progress updates every few seconds.</CardDescription>
            </CardHeader>
            <CardContent>
              {batch.data ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{shortId(batch.data.id)}</span>
                    <StatusBadge status={batch.data.status} />
                  </div>
                  <Progress value={progress} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress}% complete</span>
                    <span>
                      {batch.data.generatedCount + batch.data.skippedCount + batch.data.failedCount}{' '}
                      / {batch.data.totalFixtures} processed
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="mt-1 font-medium">{formatDate(batch.data.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Window</dt>
                      <dd className="mt-1 font-medium">Next {batch.data.periodHours} hours</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Competitions</dt>
                      <dd className="mt-1 font-medium">{batch.data.competitions.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total fixtures</dt>
                      <dd className="mt-1 font-medium">{batch.data.totalFixtures}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Generated</dt>
                      <dd className="mt-1 font-medium text-green-700">
                        {batch.data.generatedCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Skipped</dt>
                      <dd className="mt-1 font-medium">{batch.data.skippedCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Failed</dt>
                      <dd className="mt-1 font-medium text-red-600">{batch.data.failedCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="mt-1 font-medium">
                        {batch.data.startedAt
                          ? `${Math.round((new Date(batch.data.completedAt ?? Date.now()).getTime() - new Date(batch.data.startedAt).getTime()) / 1000)}s`
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/predictions/batches/${batch.data.id}`}>
                        View batch details <ArrowRight size={14} />
                      </Link>
                    </Button>
                    {batch.data.failedCount > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate()}
                      >
                        <RefreshCw size={14} /> Retry failed
                      </Button>
                    )}
                  </div>
                </div>
              ) : batch.isError ? (
                <ErrorState error={batch.error} retry={() => batch.refetch()} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Generate a batch to track its progress here.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-indigo-100 bg-indigo-50/40 p-5">
            <h3 className="text-sm font-semibold">How it works</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The worker discovers fixtures, reconstructs pre-match features, asks Jev for all three
              1X2 probabilities, and stores each result for later evaluation.
            </p>
          </Card>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Batch predictions</h3>
          <p className="text-sm text-muted-foreground">
            Results appear as the worker completes fixtures.
          </p>
        </div>
        {batch.data && (
          <span className="text-xs text-muted-foreground">Batch {shortId(batch.data.id)}</span>
        )}
      </div>
      {results.data?.items.length ? (
        <PredictionTable rows={results.data.items} interactive pageScoped />
      ) : (
        <EmptyState
          title="No predictions in this batch yet"
          description={
            batch.data?.status === 'RUNNING'
              ? 'Fixture processing is underway.'
              : 'Generate a batch to see its predictions here.'
          }
        />
      )}
    </>
  );
}
