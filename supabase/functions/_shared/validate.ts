export const PRIORITIES = ["Critical", "High", "Medium", "Low"];
export const SENTIMENTS = ["Polite", "Neutral", "Concerned", "Frustrated", "Urgent"];
export const DEFAULT_CATEGORIES = [
  "Hardware",
  "Software",
  "Network",
  "Email",
  "Account Access",
  "Security",
  "Other",
];

export type AiAnalysis = {
  category: string;
  suggested_priority: string;
  sentiment: string;
  suggested_team: string;
  summary: string;
  probable_cause: string;
  troubleshooting_steps: string[];
  confidence: number;
  escalation_recommended: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateAiPayload(
  input: unknown,
  categories: string[],
): { ok: true; value: AiAnalysis } | { ok: false; error: string } {
  if (!isObject(input)) return { ok: false, error: "AI response was not a JSON object." };
  const category = input.category;
  const suggestedPriority = input.suggested_priority;
  const sentiment = input.sentiment;
  const suggestedTeam = input.suggested_team;
  const summary = input.summary;
  const probableCause = input.probable_cause;
  const steps = input.troubleshooting_steps;
  const confidence = input.confidence;
  const escalation = input.escalation_recommended;

  if (typeof category !== "string" || !categories.includes(category)) {
    return { ok: false, error: "AI returned an invalid category." };
  }
  if (typeof suggestedPriority !== "string" || !PRIORITIES.includes(suggestedPriority)) {
    return { ok: false, error: "AI returned an invalid priority." };
  }
  if (typeof sentiment !== "string" || !SENTIMENTS.includes(sentiment)) {
    return { ok: false, error: "AI returned an invalid sentiment." };
  }
  if (typeof suggestedTeam !== "string" || suggestedTeam.trim().length < 2 || suggestedTeam.trim().length > 80) {
    return { ok: false, error: "AI returned an invalid support team." };
  }
  if (typeof summary !== "string" || summary.trim().length < 10 || summary.trim().length > 600) {
    return { ok: false, error: "AI returned an invalid summary." };
  }
  if (typeof probableCause !== "string" || probableCause.trim().length < 10 || probableCause.trim().length > 600) {
    return { ok: false, error: "AI returned an invalid probable cause." };
  }
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 6) {
    return { ok: false, error: "AI returned invalid troubleshooting steps." };
  }
  const cleanSteps: string[] = [];
  for (const step of steps) {
    if (typeof step !== "string" || step.trim().length < 3 || step.trim().length > 300) {
      return { ok: false, error: "AI returned invalid troubleshooting steps." };
    }
    cleanSteps.push(step.trim());
  }
  if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "AI returned an invalid confidence score." };
  }
  if (typeof escalation !== "boolean") {
    return { ok: false, error: "AI returned an invalid escalation flag." };
  }

  return {
    ok: true,
    value: {
      category,
      suggested_priority: suggestedPriority,
      sentiment,
      suggested_team: suggestedTeam.trim(),
      summary: summary.trim(),
      probable_cause: probableCause.trim(),
      troubleshooting_steps: cleanSteps,
      confidence,
      escalation_recommended: escalation,
    },
  };
}
