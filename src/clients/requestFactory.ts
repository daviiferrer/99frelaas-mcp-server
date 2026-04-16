export const buildFormUrlEncoded = (input: Record<string, string | number | boolean>): string => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    params.set(key, String(value));
  });
  return params.toString();
};
