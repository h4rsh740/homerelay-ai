import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAndParseJSON, generatePlan } from '@/lib/ai/orchestrator';

// Mock @google/generative-ai with a real constructor class
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: mockGenerateContent,
      };
    }
  },
}));

describe('extractAndParseJSON', () => {
  it('parses raw JSON object', () => {
    const raw = '{"name":"Order groceries","steps":[]}';
    expect(extractAndParseJSON(raw)).toEqual({
      name: 'Order groceries',
      steps: [],
    });
  });

  it('parses JSON wrapped in markdown json fences', () => {
    const raw = '```json\n{"name":"Order groceries","steps":[]}\n```';
    expect(extractAndParseJSON(raw)).toEqual({
      name: 'Order groceries',
      steps: [],
    });
  });

  it('parses JSON wrapped in generic markdown fences', () => {
    const raw = '```\n{"name":"Order groceries","steps":[]}\n```';
    expect(extractAndParseJSON(raw)).toEqual({
      name: 'Order groceries',
      steps: [],
    });
  });

  it('extracts JSON when preceded by conversational commentary', () => {
    const raw = 'Here is the plan you requested:\n```json\n{"summary":"Plan","steps":[]}\n```\nHope this helps!';
    expect(extractAndParseJSON(raw)).toEqual({
      summary: 'Plan',
      steps: [],
    });
  });

  it('extracts embedded JSON braces without markdown fences', () => {
    const raw = 'Certainly! {"summary":"Direct JSON","steps":[]} Have a nice day!';
    expect(extractAndParseJSON(raw)).toEqual({
      summary: 'Direct JSON',
      steps: [],
    });
  });

  it('throws when string contains no valid JSON', () => {
    expect(() => extractAndParseJSON('This is not json at all')).toThrow();
  });
});

describe('generatePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  it('successfully generates and validates a plan with Gemini', async () => {
    const mockPlanJson = JSON.stringify({
      user_intent: 'Order milk and eggs',
      summary: 'Create grocery shopping task and reminder',
      steps: [
        {
          step_index: 0,
          description: 'Create task for ordering milk and eggs',
          tool_name: 'create_task',
          tool_input: {
            title: 'Order milk and eggs',
            priority: 'medium',
          },
        },
      ],
      estimated_duration_seconds: 5,
      requires_confirmation: true,
    });

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => `\`\`\`json\n${mockPlanJson}\n\`\`\``,
      },
    });

    const result = await generatePlan('Order milk and eggs');
    expect(result.plan.summary).toBe('Create grocery shopping task and reminder');
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].tool_name).toBe('create_task');
    expect(result.plan.steps[0].tool_input.title).toBe('Order milk and eggs');
  });

  it('retries on initial malformed response and succeeds on second attempt', async () => {
    const validPlanJson = JSON.stringify({
      user_intent: 'Check parcels',
      summary: 'Look up parcel status',
      steps: [
        {
          step_index: 0,
          description: 'Lookup parcel',
          tool_name: 'lookup_parcel',
          tool_input: {
            tracking_number: 'AMZN-999-DELIV',
          },
        },
      ],
      estimated_duration_seconds: 2,
      requires_confirmation: false,
    });

    // First attempt fails with malformed string
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Sorry, I cannot produce JSON right now.',
      },
    });

    // Second attempt succeeds
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => validPlanJson,
      },
    });

    const result = await generatePlan('Where is my package?');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.plan.summary).toBe('Look up parcel status');
  });

  it('throws error when all retries fail', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Invalid payload permanently',
      },
    });

    await expect(generatePlan('Do something')).rejects.toThrow('Plan generation failed after 3 attempts');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('works with OpenAI provider when AI_PROVIDER is openai', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    const validPlan = {
      user_intent: 'Summarize household',
      summary: 'Get household summary',
      steps: [
        {
          step_index: 0,
          description: 'Fetch summary',
          tool_name: 'get_household_summary',
          tool_input: {},
        },
      ],
      estimated_duration_seconds: 1,
      requires_confirmation: false,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(validPlan),
              },
            },
          ],
        }),
      } as unknown as Response;
    });

    const result = await generatePlan('Give me household status');
    expect(result.plan.summary).toBe('Get household summary');
    expect(fetchSpy).toHaveBeenCalled();
  });
});
