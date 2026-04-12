import { supabase } from "./supabase";

const EDGE_FUNCTION_TIMEOUT = 30_000;

export async function callEdgeFunction<T = any>(
  functionName: string,
  body?: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not logged in");

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const controller = new AbortController();
  const effectiveTimeout = timeoutMs ?? EDGE_FUNCTION_TIMEOUT;
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const res = await fetch(`${url}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": anonKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Edge Function error (HTTP ${res.status})`);
    return data as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${functionName} timed out after 30 seconds`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
