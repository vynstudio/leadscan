import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";

const MemStore = MemoryStore(session);

export function setupAuth(app: Express) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "leadscan-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24h
      store: new MemStore({ checkPeriod: 86400000 }),
    })
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).authenticated) return next();
  res.status(401).json({ message: "Unauthorized" });
}

export function loginRoute(app: Express) {
  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    const correctPassword = process.env.APP_PASSWORD || "leadscan2024";
    if (password === correctPassword) {
      (req.session as any).authenticated = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ message: "Invalid password" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    res.json({ authenticated: !!(req.session as any).authenticated });
  });
}
