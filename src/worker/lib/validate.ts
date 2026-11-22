import type { Context } from "hono";
import type { z } from "zod";
import { badRequest, zodToHttp } from "./errors";

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const ct = c.req.header("Content-Type") ?? "";
  if (!ct.includes("application/json")) throw badRequest("Expected a JSON request body.");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw zodToHttp(r.error);
  return r.data;
}

export function query<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw zodToHttp(r.error);
  return r.data;
}
