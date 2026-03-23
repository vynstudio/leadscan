import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export default function NextdoorVerify() {
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/nextdoor/verification-status");
        const data = await res.json();
        setWaiting(data.waiting);
        if (data.waiting) setSubmitted(false);
      } catch {}
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!waiting) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    try {
      await apiRequest("POST", "/api/nextdoor/verify", { code: code.trim() });
      setSubmitted(true);
      setCode("");
    } catch {
      setError("Failed to submit code. Try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.14 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Nextdoor Verification Required</h3>
            <p className="text-xs text-muted-foreground">Check your phone or email for a code</p>
          </div>
        </div>

        {submitted ? (
          <div className="text-center py-4">
            <div className="text-sm text-green-500 font-medium">✓ Code submitted — verifying...</div>
            <p className="text-xs text-muted-foreground mt-1">This will close automatically</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Nextdoor sent a verification code to confirm your identity. Enter it below to continue.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter verification code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
              maxLength={8}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Submit Code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
