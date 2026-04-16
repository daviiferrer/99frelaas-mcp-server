export const nowIso = (): string => new Date().toISOString();

export const startOfDayIso = (): string => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};
