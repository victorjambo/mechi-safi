import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDate(value: string | Date, timezone?: string) {
  const configured = typeof document === 'undefined' ? undefined : document.documentElement.dataset.timezone;
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone ?? configured ?? 'Africa/Nairobi' }).format(new Date(value));
}
export function percent(value: number | null | undefined, digits = 0) { return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`; }
export function shortId(id: string) { return id.length > 12 ? `${id.slice(0, 8)}…` : id; }
