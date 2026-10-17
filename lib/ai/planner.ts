/**
 * HomeRelay AI — Action Planner
 * Interprets natural-language household requests, selects appropriate MCP tools,
 * validates the plan structure and tool inputs, and registers the plan
 * for server-enforced approval.
 *
 * SERVER-ONLY. Planning logic is strictly separated from MCP execution.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PlanSchema, type Plan, type PlanStep } from '@/lib/validators/schemas';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import {
  GEMINI_FUNCTION_DECLARATIONS,
  validateToolCall,
} from './tools';
import { registerPlanForApproval, type ManagedPlan } from './approval';

export interface PlannedActionResponse {
  plan: Plan;
  managedPlan: ManagedPlan;
  rawResponse: string;
}

const MAX_RETRIES = 3;

/**
 * Extracts and parses JSON candidate from text.
 */
export function extractAndParseJSON(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('No valid JSON object found in model response');
  }
}

/**
 * Validates every step in a plan:
 * 1. Confirms tool_name is in the allowed MCP whitelist.
 * 2. Confirms tool_input passes the tool's specific Zod schema.
 */
export function validatePlanSteps(plan: Plan): Plan {
  const validatedSteps: PlanStep[] = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const { validatedInput } = validateToolCall(
      step.tool_name,
      step.tool_input as Record<string, unknown>
    );

    validatedSteps.push({
      ...step,
      step_index: i,
      tool_input: validatedInput,
    });
  }

  return {
    ...plan,
    steps: validatedSteps,
  };
}

/**
 * Deterministic offline planner for tests and environments without LLM keys.
 * Accurately interprets common household intents into valid MCP action plans.
 */
export function generateDeterministicPlan(userPrompt: string): Plan {
  const lower = userPrompt.toLowerCase();
  const steps: PlanStep[] = [];
  let summary = 'Household action plan';

  // 1. Parcel tracking request
  const parcelMatch = userPrompt.match(/DEMO-TRK-\d{3}/i) || userPrompt.match(/tracking|parcel|package/i);
  if (parcelMatch) {
    const trkNumber = (userPrompt.match(/DEMO-TRK-\d{3}/i)?.[0] ?? 'DEMO-TRK-001').toUpperCase();
    steps.push({
      step_index: steps.length,
      description: `Check status for simulated parcel ${trkNumber}`,
      tool_name: 'get_parcel_status',
      tool_input: { tracking_number: trkNumber },
    });
    summary = `Check status for parcel ${trkNumber}`;
  }

  // 2. Reminder request
  const reminderMatch = lower.includes('remind') || lower.includes('reminder') || lower.includes('at 5') || lower.includes('at 7');
  if (reminderMatch) {
    const remindAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const message = userPrompt.replace(/remind\s+(me\s+)?(to\s+)?/i, '').trim() || 'Household reminder';
    steps.push({
      step_index: steps.length,
      description: `Schedule reminder: "${message}"`,
      tool_name: 'schedule_reminder',
      tool_input: {
        message: message.slice(0, 500),
        remind_at: remindAt,
      },
    });
    summary = summary === 'Household action plan' ? `Schedule reminder for: ${message}` : `${summary} and schedule reminder`;
  }

  // 3. Task creation request
  const isListOnly = lower.startsWith('list ') || lower.startsWith('show ') || lower === 'tasks';
  if (!isListOnly && (lower.includes('task') || lower.includes('clean') || lower.includes('order') || lower.includes('buy') || lower.includes('prepare') || steps.length === 0)) {
    const taskTitle = userPrompt.replace(/create\s+(a\s+)?task\s+(to\s+|for\s+)?/i, '').trim() || userPrompt;
    steps.push({
      step_index: steps.length,
      description: `Create task: "${taskTitle.slice(0, 100)}"`,
      tool_name: 'create_task',
      tool_input: {
        title: taskTitle.slice(0, 200),
        priority: lower.includes('urgent') || lower.includes('asap') ? 'high' : 'medium',
      },
    });
    summary = summary === 'Household action plan' ? `Create task: ${taskTitle.slice(0, 80)}` : `${summary} and create task`;
  }

  // 4. List tasks if requested
  if (isListOnly) {
    steps.push({
      step_index: steps.length,
      description: 'List current pending household tasks',
      tool_name: 'list_tasks',
      tool_input: { status: 'pending' },
    });
    summary = 'List pending household tasks';
  }

  return {
    summary: summary.slice(0, 500),
    steps,
    estimated_duration_seconds: steps.length * 2,
  };
}

/**
 * Generates plan using Google Gemini with function declarations / tools.
 */
async function generateWithGemini(userPrompt: string, retryReminder: boolean): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  // Use Gemini 3.8 Flash (free tier model)
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
  });

  const fullPrompt = [
    SYSTEM_PROMPT,
    retryReminder
      ? '\n\nIMPORTANT: Your previous response was not valid JSON or violated tool schemas. Return ONLY the JSON object, matching the schema exactly.'
      : '',
    '\n\nUser request: ',
    buildUserPrompt(userPrompt),
  ].join('');

  const result = await model.generateContent(fullPrompt);
  return result.response.text();
}

/**
 * Generates plan using OpenRouter free models as a reliable fallback.
 */
async function generateWithOpenRouter(userPrompt: string, retryReminder: boolean): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const freeModels = [
    'liquid/lfm-2.5-2.6b:free',
    'google/gemma-4-26b-a4b-it:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3.5-lightning:free',
  ];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: retryReminder
        ? `${buildUserPrompt(userPrompt)}\n\nReturn ONLY valid JSON matching the PlanSchema. No markdown.`
        : buildUserPrompt(userPrompt),
    },
  ];

  for (const model of freeModels) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'HomeRelay AI',
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch {
      // Continue to next free model
    }
  }

  throw new Error('All OpenRouter free models exhausted or unavailable');
}

/**
 * Generates plan using OpenAI.
 */
async function generateWithOpenAI(userPrompt: string, retryReminder: boolean): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: retryReminder
        ? `${buildUserPrompt(userPrompt)}\n\nReturn ONLY valid JSON matching the PlanSchema. No markdown.`
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
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Main planner function:
 * 1. Interprets household request.
 * 2. Selects appropriate MCP tools.
 * 3. Validates plan and tool arguments.
 * 4. Registers plan in server-side approval registry in "pending_approval" state.
 */
export async function createActionPlan(userPrompt: string): Promise<PlannedActionResponse> {
  if (!userPrompt || userPrompt.trim().length === 0) {
    throw new Error('User prompt cannot be empty');
  }

  const provider = process.env.AI_PROVIDER ?? 'gemini';
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

  let rawResponse = '';
  let parsedPlan: Plan | null = null;

  // Use offline deterministic planner if keys are absent or mode is mock
  if (provider === 'mock' || (!hasGeminiKey && !hasOpenRouterKey && !hasOpenAIKey)) {
    parsedPlan = generateDeterministicPlan(userPrompt);
    rawResponse = JSON.stringify(parsedPlan);
  } else {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (provider === 'openai' && hasOpenAIKey) {
          rawResponse = await generateWithOpenAI(userPrompt, attempt > 1);
        } else if (hasGeminiKey) {
          try {
            rawResponse = await generateWithGemini(userPrompt, attempt > 1);
          } catch (geminiErr) {
            // In case of breakdown/failure on Gemini, fall back to OpenRouter free models
            if (hasOpenRouterKey) {
              rawResponse = await generateWithOpenRouter(userPrompt, attempt > 1);
            } else {
              throw geminiErr;
            }
          }
        } else if (hasOpenRouterKey) {
          rawResponse = await generateWithOpenRouter(userPrompt, attempt > 1);
        }

        const extracted = extractAndParseJSON(rawResponse);
        const validatedPlan = PlanSchema.parse(extracted);
        parsedPlan = validatePlanSteps(validatedPlan);
        break;
      } catch {
        if (attempt === MAX_RETRIES) {

          // Graceful fallback to deterministic planner if external APIs are exhausted
          parsedPlan = generateDeterministicPlan(userPrompt);
          rawResponse = JSON.stringify(parsedPlan);
          break;
        }
      }
    }
  }


  if (!parsedPlan) {
    throw new Error('Failed to generate plan');
  }

  // Final step validation: ensure every step passes tool argument validation
  const validatedPlan = validatePlanSteps(parsedPlan);

  // Register plan in server-enforced approval store
  const managedPlan = registerPlanForApproval(userPrompt, validatedPlan);

  return {
    plan: validatedPlan,
    managedPlan,
    rawResponse,
  };
}
