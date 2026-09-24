export const postMetricKeys = ['likes', 'comments', 'replies', 'saves', 'shares', 'reach', 'impressions', 'views', 'engagement'] as const;
type MetricRow = { availableMetrics?: string[]; [key: string]: unknown };

// Old collectors stored absent metrics as zero. Preserve those rows but do
// not promote ambiguous legacy zeros into verified observations.
export const metricValue = (row: MetricRow | undefined, key: string): number | null => {
  const value = row?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return row?.availableMetrics?.includes(key) || (!row?.availableMetrics?.length && value > 0) ? value : null;
};

export const normalizedMetrics = (row: MetricRow | undefined) => Object.fromEntries(
  postMetricKeys.map(key => [key, metricValue(row, key)]),
);

export const aggregateMetrics = (rows: MetricRow[]) => {
  const values = {} as Record<typeof postMetricKeys[number], number | null>;
  const coverage: Record<string, number> = {};
  for (const key of postMetricKeys) {
    const observed = rows.map(row => metricValue(row, key)).filter((value): value is number => value !== null);
    coverage[key] = observed.length;
    values[key] = observed.length ? observed.reduce((sum, value) => sum + value, 0) / (key === 'engagement' ? observed.length : 1) : null;
  }
  const interactionKeys = ['likes', 'comments', 'saves', 'shares'] as const;
  const observedInteractions = interactionKeys.map(key => values[key]).filter((value): value is number => value !== null);
  return { ...values, interactions: observedInteractions.length ? observedInteractions.reduce((sum, value) => sum + value, 0) : null,
    coverage, partial: interactionKeys.some(key => coverage[key] < rows.length) };
};

export const receivedMetrics = (items: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>) =>
  [...new Set(items.filter(item => typeof (item.values?.[0]?.value ?? item.total_value?.value) === 'number' && Number.isFinite(item.values?.[0]?.value ?? item.total_value?.value))
    .map(item => {
      if (item.name === 'saved') return 'saves';
      if (['video_views', 'plays'].includes(item.name || '')) return 'views';
      if (item.name === 'accounts_engaged') return 'accountsEngaged';
      if (item.name === 'total_interactions') return 'totalInteractions';
      if (item.name === 'profile_links_taps') return 'profileLinkTaps';
      return item.name;
    }).filter((name): name is string => Boolean(name)))];
