'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCw, Save } from 'lucide-react';
import { api, patch, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ErrorState, PageHeading } from '@/components/common';

interface Settings {
  settings: { timezone: string; automaticPredictions: boolean; automaticCutoffHours: number };
  configs: { id: string; model: string; featureSetVersion: string; questionVersion: string }[];
  mockMode: boolean;
}

export default function SettingsPage() {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [timezone, setTimezone] = useState('Africa/Nairobi');
  const [automatic, setAutomatic] = useState(false);
  const [cutoff, setCutoff] = useState(24);
  useEffect(() => {
    if (query.data) {
      setTimezone(query.data.settings.timezone);
      setAutomatic(query.data.settings.automaticPredictions);
      setCutoff(query.data.settings.automaticCutoffHours);
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      patch('/settings', {
        timezone,
        automaticPredictions: automatic,
        automaticCutoffHours: cutoff,
      }),
    onSuccess: () => {
      document.documentElement.dataset.timezone = timezone;
      query.refetch();
    },
  });
  const sync = useMutation({ mutationFn: () => post<{ jobId: string }>('/admin/fixtures/sync') });
  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage your display timezone, automation, and data synchronization."
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Display and scheduling</CardTitle>
              <CardDescription>
                Times are stored in UTC and displayed in your chosen timezone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Africa/Nairobi"
                />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(e) => setAutomatic(e.target.checked)}
                  className="accent-[#635BFF]"
                />{' '}
                Enable automatic predictions
              </label>
              {automatic && (
                <div className="space-y-2">
                  <Label htmlFor="cutoff">Predict before kickoff (hours)</Label>
                  <Input
                    id="cutoff"
                    type="number"
                    min={1}
                    max={168}
                    value={cutoff}
                    onChange={(e) => setCutoff(Number(e.target.value))}
                  />
                </div>
              )}
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save size={16} /> {save.isPending ? 'Saving…' : 'Save settings'}
              </Button>
              {save.isSuccess && (
                <p role="status" className="text-sm text-green-700">
                  Settings saved.
                </p>
              )}
              {save.error && (
                <p role="alert" className="text-sm text-red-600">
                  {save.error.message}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Data provider</CardTitle>
              <CardDescription>Sync upcoming fixtures and recent final scores now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between text-sm">
                <span>Provider mode</span>
                <Badge
                  className={
                    query.data?.mockMode
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-green-200 bg-green-50 text-green-700'
                  }
                >
                  {query.data?.mockMode ? 'Mock · synthetic data' : 'Live providers'}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Fixture discovery also runs every six hours; results sync every 30 minutes. Mock
                mode uses synthetic fixtures and model outputs for development.
              </p>
              <Button variant="secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw size={16} /> {sync.isPending ? 'Queuing…' : 'Sync fixtures now'}
              </Button>
              {sync.data && (
                <p role="status" className="text-sm text-green-700">
                  Sync job queued: {sync.data.jobId}
                </p>
              )}
              {sync.error && (
                <p role="alert" className="text-sm text-red-600">
                  {sync.error.message}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Prediction configurations</CardTitle>
              <CardDescription>
                Only enabled, functioning configurations are shown in the generation form.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {query.data?.configs.map((config) => (
                  <div key={config.id} className="rounded-lg border border-border p-4 text-sm">
                    <div className="font-semibold">{config.id}</div>
                    <div className="mt-2 text-muted-foreground">Model: {config.model}</div>
                    <div className="text-muted-foreground">
                      Feature set: {config.featureSetVersion}
                    </div>
                    <div className="text-muted-foreground">Question: {config.questionVersion}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
