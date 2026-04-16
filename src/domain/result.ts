export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; status?: number } };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = (
  code: string,
  message: string,
  status?: number,
): Result<never> => ({
  ok: false,
  error: { code, message, status },
});
