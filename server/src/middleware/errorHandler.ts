import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: unknown
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

export function errorHandler(
  err: Error | ApiError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }
  
  // Custom API errors
  if ("statusCode" in err) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || "ERROR",
        message: err.message,
        details: err.details,
      },
    });
    return;
  }
  
  // Unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" 
        ? "Internal server error" 
        : err.message,
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
