import { ValidationError } from '../utils/errors';

export const analyticsDays = (value: unknown = 30): number => {
  const days = Number(value);
  if (![7, 30, 90, 365, 730].includes(days)) throw new ValidationError('Escolha um período disponível no relatório.');
  return days;
};

export const publicationPeriod = (days = 30, now = new Date()) => ({
  gte: new Date(now.getTime() - analyticsDays(days) * 86_400_000),
  lte: now,
});
