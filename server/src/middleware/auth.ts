import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { prisma, isDatabaseUnreachable } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: Role; expiresAt: number }>();

export type JwtPayload = {
  sub: string;
  role: Role;
};

export function signToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const cached = roleCache.get(decoded.sub);
    if (cached && cached.expiresAt > Date.now()) {
      req.user = { sub: decoded.sub, role: cached.role };
      next();
      return;
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { role: true },
    });
    if (!dbUser) {
      roleCache.delete(decoded.sub);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    roleCache.set(decoded.sub, { role: dbUser.role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
    req.user = { sub: decoded.sub, role: dbUser.role };
    next();
  } catch (err) {
    if (isDatabaseUnreachable(err)) {
      res.status(503).json({ error: "Database is unreachable. Try again in a moment." });
      return;
    }
    res.status(500).json({ error: "Auth check failed" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
