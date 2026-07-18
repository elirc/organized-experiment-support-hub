/**
 * What this file does:
 * Provides a thin API boundary for parsing JSON, converting errors, and returning consistent REST responses.
 * What calls it:
 * Route handlers under `src/app/api/*`.
 * What it calls:
 * Zod, `src/lib/auth/session.ts`, and `src/lib/http/errors.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Letting each route invent its own error shape, which makes frontend handling brittle.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/http/errors";

export const parseJson = async <T>(request: Request, schema: ZodSchema<T>) => {
  const json = await request.json();
  return schema.parse(json);
};

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export const withRouteErrorHandling = async <T>(work: () => Promise<T>) => {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "The request payload was invalid.",
            details: error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.status },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something unexpected happened.",
        },
      },
      { status: 500 },
    );
  }
};

export const requireRouteSession = async () => requireSession();
