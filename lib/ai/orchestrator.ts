/**
 * AI Orchestrator — converts natural-language household commands into
 * a structured Plan using Gemini 2.0 Flash (or OpenAI if configured).
 *
 * SERVER-ONLY. Never import from client components.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PlanSchema, type Plan } from '@/lib/validators/schemas';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { registerPlanForApproval, type ManagedPlan } from './approval';

// Available MCP tool names — kept in sync with the MCP server tools
export const AVAILABLE_TOOLS = [
  'create_task',
  'list_tasks',
  'update_task',
  'delete_task',
  'create_reminder',
  'list_reminders',
  'delete_reminder',
  'lookup_parcel',
  'get_household_summary',
] as const;

export type AvailableTool = (typeof AVAILABLE_TOOLS)[number];

export interface GeneratePlanResult {
  plan: Plan;
  rawResponse: string;
  managedPlan?: ManagedPlan;
  plan_id?: string;
}

const MAX_RETRIES = 3;

/**
 * Generates an action plan from a natural-language household command.
 * Validates the AI output against PlanSchema; retries up to MAX_RETRIES times.
 */
export async function generatePlan(userPrompt: string): Promise<GeneratePlanResult> {
  const provider = process.env.AI_PROVIDER ?? 'gemini';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const rawResponse =
        provider === 'openai'
          ? await generateWithOpenAI(userPrompt, attempt > 1)
          : await generateWithGemini(userPrompt, attempt > 1);

      const parsed = extractAndParseJSON(rawResponse);
      const plan = PlanSchema.parse(parsed);
      const managedPlan = registerPlanForApproval(userPrompt, plan);

      return { plan, rawResponse, managedPlan, plan_id: managedPlan.plan_id };
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Plan generation failed after ${MAX_RETRIES} attempts: ${message}`);
      }
      // Loop continues with reminder that schema validation failed
    }
  }

  // TypeScript requires this even though it's unreachable
  throw new Error('Unexpected code path in generatePlan');
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

async function generateWithGemini(
  userPrompt: string,
  includeSchemaReminder: boolean
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const fullPrompt = [
    SYSTEM_PROMPT,
    includeSchemaReminder
      ? '\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no markdown fences.'
      : '',
    '\n\nUser request: ',
    buildUserPrompt(userPrompt),
  ].join('');

  const result = await model.generateContent(fullPrompt);
  return result.response.text();
}

// ─── OpenAI (optional fallback) ──────────────────────────────────────────────

async function generateWithOpenAI(
  userPrompt: string,
  includeSchemaReminder: boolean
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: includeSchemaReminder
        ? `${buildUserPrompt(userPrompt)}\n\nReturn ONLY valid JSON. No markdown fences.`
        : buildUserPrompt(userPrompt),
    },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

export function extractAndParseJSON(text: string): unknown {
  // Check if wrapped in markdown code fence
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: search for first outer JSON object
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('No valid JSON object found in model response');
  }
}
