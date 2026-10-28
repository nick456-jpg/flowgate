export type ProblemFieldError = {
  pointer: string;
  message: string;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: ProblemFieldError[];
};

export function problemType(slug: string): string {
  return `https://flowgate.dev/problems/${slug}`;
}
