export class AdapterError extends Error {
  public readonly code: string;
  public readonly status?: number;

  constructor(message: string, code = "ADAPTER_ERROR", status?: number) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.status = status;
  }
}

export class AuthRequiredError extends AdapterError {
  constructor(message = "Authentication required") {
    super(message, "AUTH_REQUIRED", 401);
    this.name = "AuthRequiredError";
  }
}

export class RateLimitError extends AdapterError {
  constructor(message = "Rate limit exceeded") {
    super(message, "RATE_LIMIT", 429);
    this.name = "RateLimitError";
  }
}
