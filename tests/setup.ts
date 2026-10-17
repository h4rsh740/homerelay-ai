// Vitest global setup
// Add any global test helpers or mocks here

// Suppress console.error output in tests unless explicitly testing it
// (Remove this if you need to debug test output)
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
vi.stubEnv('MCP_SERVER_URL', 'http://localhost:3001/mcp');
vi.stubEnv('MCP_SERVER_SECRET', 'test-secret');
vi.stubEnv('AI_PROVIDER', 'gemini');
vi.stubEnv('PG_IN_MEMORY', 'true');

