import { NextRequest, NextResponse } from 'next/server';
import { createActionPlan } from '@/lib/ai/planner';
import { executeApprovedPlan } from '@/lib/ai/executor';
import { approvePlan, cancelPlan, registerPlanForApproval } from '@/lib/ai/approval';

interface AlexaSlot {
  name: string;
  value?: string;
}

interface AlexaRequestEnvelope {
  version?: string;
  session?: {
    new?: boolean;
    sessionId?: string;
    attributes?: Record<string, any>;
  };
  request?: {
    type: string;
    intent?: {
      name: string;
      slots?: Record<string, AlexaSlot>;
    };
  };
}

function buildAlexaResponse(
  speechText: string,
  shouldEndSession: boolean,
  sessionAttributes: Record<string, any> = {},
  repromptText?: string
) {
  return NextResponse.json({
    version: '1.0',
    sessionAttributes,
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: speechText,
      },
      ...(repromptText
        ? {
            reprompt: {
              outputSpeech: {
                type: 'PlainText',
                text: repromptText,
              },
            },
          }
        : {}),
      shouldEndSession,
    },
  });
}

/**
 * POST /api/alexa
 * Handles Alexa Skills Kit (ASK) voice requests directly:
 * - LaunchRequest: Welcome greeting
 * - PlanIntent / CoordinateIntent: Generates plan via Gemini, returns speech summary, requests confirmation
 * - AMAZON.YesIntent: Approves and executes plan via MCP, confirms outcome
 * - AMAZON.NoIntent: Rejects and cancels plan
 * - AMAZON.HelpIntent / StopIntent / CancelIntent: Standard voice navigation
 */
export async function POST(req: NextRequest) {
  let body: AlexaRequestEnvelope;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestType = body.request?.type;
  const sessionAttributes = body.session?.attributes || {};
  const sessionId = body.session?.sessionId || `alexa-${Date.now()}`;

  // 1. Launch Request (User: "Alexa, open Home Relay")
  if (requestType === 'LaunchRequest') {
    return buildAlexaResponse(
      'Welcome to Home Relay AI. What household task, reminder, or parcel tracking would you like me to coordinate?',
      false,
      {},
      'You can say: Clean the kitchen at 5pm and set a reminder to take out the trash.'
    );
  }

  // 2. Intent Request
  if (requestType === 'IntentRequest') {
    const intentName = body.request?.intent?.name || '';
    const slots = body.request?.intent?.slots || {};

    // ── User says YES to confirm plan ──
    if (intentName === 'AMAZON.YesIntent') {
      const pendingPlanId = sessionAttributes.plan_id;
      const pendingPlan = sessionAttributes.plan;
      const prompt = sessionAttributes.prompt || 'Alexa voice coordination';

      if (!pendingPlanId || !pendingPlan) {
        return buildAlexaResponse(
          'There is no pending household plan waiting for approval. What would you like me to do?',
          false,
          {},
          'What would you like me to coordinate?'
        );
      }

      try {
        let activePlanId = pendingPlanId;
        try {
          approvePlan(activePlanId);
        } catch {
          // If serverless container cold-started between the user's voice prompt and voice confirmation,
          // re-register the verified plan stored in the Alexa session attributes
          const reg = registerPlanForApproval(prompt, pendingPlan);
          activePlanId = reg.plan_id;
          approvePlan(activePlanId);
        }

        const report = await executeApprovedPlan({
          plan_id: activePlanId,
          prompt,
          plan: pendingPlan,
          session_id: sessionId,
        });

        if (report.overall_status === 'completed') {
          return buildAlexaResponse(
            `Plan executed successfully. All ${report.completed_steps.length} actions have been scheduled and saved to your household board.`,
            true
          );
        } else {
          return buildAlexaResponse(
            `Plan partially completed. ${report.completed_steps.length} succeeded, but ${report.failed_steps.length} could not be completed.`,
            true
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown execution error';
        return buildAlexaResponse(
          `There was an error executing the plan: ${msg}`,
          true
        );
      }
    }

    // ── User says NO to cancel plan ──
    if (intentName === 'AMAZON.NoIntent') {
      const pendingPlanId = sessionAttributes.plan_id;
      if (pendingPlanId) {
        try {
          cancelPlan(pendingPlanId);
        } catch {
          // Ignore if already cancelled or expired
        }
      }
      return buildAlexaResponse(
        'Understood. I cancelled the plan. Let me know whenever you need anything else.',
        true
      );
    }

    // ── Help Intent ──
    if (intentName === 'AMAZON.HelpIntent') {
      return buildAlexaResponse(
        'Home Relay AI helps coordinate your home. You can tell me to schedule chores, create reminders, or track deliveries. For example: Remind me to water the plants tomorrow at 9am. What can I do for you?',
        false,
        sessionAttributes,
        'What would you like me to coordinate?'
      );
    }

    // ── Stop / Cancel Intents ──
    if (
      intentName === 'AMAZON.StopIntent' ||
      intentName === 'AMAZON.CancelIntent'
    ) {
      return buildAlexaResponse('Goodbye from Home Relay!', true);
    }

    // ── Planning Intent (PlanIntent, CoordinateIntent, or Fallback) ──
    // Extract query from various common slot names
    const prompt =
      slots.UserPrompt?.value ||
      slots.prompt?.value ||
      slots.query?.value ||
      slots.request?.value ||
      slots.task?.value ||
      slots.CatchAll?.value;

    if (!prompt || prompt.trim().length === 0) {
      return buildAlexaResponse(
        'I did not catch that. What household task or reminder would you like me to coordinate?',
        false,
        {},
        'For example: Schedule grocery shopping tomorrow at 10am.'
      );
    }

    try {
      const { plan, managedPlan } = await createActionPlan(prompt);
      const stepCount = plan.steps.length;
      const stepWord = stepCount === 1 ? 'action' : 'actions';
      const spokenSummary = plan.summary || 'coordinate your request';

      const speech = `I prepared a plan with ${stepCount} ${stepWord}: ${spokenSummary}. Would you like me to execute this now?`;

      return buildAlexaResponse(
        speech,
        false,
        {
          plan_id: managedPlan.plan_id,
          plan,
          prompt,
        },
        'Say yes to execute this plan, or no to cancel.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not generate a plan';
      return buildAlexaResponse(
        `Sorry, I had trouble planning that: ${msg}. Please try asking again.`,
        false,
        {},
        'What would you like me to coordinate?'
      );
    }
  }

  // 3. Session Ended Request
  if (requestType === 'SessionEndedRequest') {
    return NextResponse.json({ version: '1.0', response: {} });
  }

  // Fallback
  return buildAlexaResponse(
    'Home Relay AI is ready. How can I help with your household today?',
    false,
    {},
    'What would you like to coordinate?'
  );
}
