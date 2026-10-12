export function ollamaConfig(): { base: string; model: string; apiKey: string } | { error: string } {
  const raw = Deno.env.get("OLLAMA_BASE_URL")?.trim() ?? "";
  const model = Deno.env.get("OLLAMA_MODEL")?.trim() ?? "";
  const apiKey = Deno.env.get("OLLAMA_API_KEY")?.trim() ?? "";
  if (!raw || !model) return { error: "The Ollama API is not configured on the server." };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "The Ollama API is not configured correctly." };
    }
  } catch {
    return { error: "The Ollama API is not configured correctly." };
  }
  return { base: raw.replace(/\/$/, ""), model, apiKey };
}

export function ollamaHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export async function ollamaChat(base: string, model: string, messages: unknown[], apiKey = ""): Promise<
  { ok: true; content: string } | { ok: false; code: string; message: string }
> {
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: ollamaHeaders(apiKey),
      body: JSON.stringify({ model, stream: false, format: "json", messages }),
    });
    if (response.status === 404) {
      return { ok: false, code: "model_missing", message: "The configured Ollama model is not available on the API server." };
    }
    if (!response.ok) {
      return { ok: false, code: "ollama_unavailable", message: "The Ollama API could not analyze this ticket." };
    }
    const payload = await response.json();
    const content = payload?.message?.content;
    if (typeof content !== "string" || content.length === 0 || content.length > 8000) {
      return { ok: false, code: "invalid_ai_response", message: "The AI response could not be validated. A support agent can classify this ticket manually." };
    }
    return { ok: true, content };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, code: "timeout", message: "The Ollama API timed out. The ticket can still be handled manually." };
    }
    return { ok: false, code: "ollama_unavailable", message: "The Ollama API is unreachable. The ticket can still be handled manually." };
  }
}
