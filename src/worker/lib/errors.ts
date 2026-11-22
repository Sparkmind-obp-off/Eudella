import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new HttpError(400, "invalid_input", message, fields);
export const unauthorized = (message = "Please sign in to continue.") => new HttpError(401, "unauthenticated", message);
export const forbidden = (message = "You do not have permission to do that.", code = "forbidden") => new HttpError(403, code, message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);

export function zodToHttp(err: z.ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return badRequest("Some fields need attention.", fields);
}
