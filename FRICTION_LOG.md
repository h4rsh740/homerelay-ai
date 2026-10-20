# 🛠️ HomeRelay AI — Developer Friction Log & Product Feedback

> **Devpost Hackathon Submission:** Build, Ship, Shape: Amazon Developer Hackathon 2026  
> **Repository:** [https://github.com/h4rsh740/homerelay-ai](https://github.com/h4rsh740/homerelay-ai)  
> **Project Track:** Alexa+ Track & Model Context Protocol (MCP)

---

## 📌 Friction Log Overview

This friction log documents real developer experience and engineering hurdles encountered while integrating the **Amazon Alexa Skills Kit (ASK)** with modern multi-step agentic LLM planning and the open **Model Context Protocol (MCP)** on serverless architecture.

---

### Incident 1: ASK 8-Second Synchronous Timeout with Multi-Step Agent Workflows

- **Specific Task Attempted:**  
  Routing natural-language voice requests (e.g., *"Clean the kitchen and prepare for dinner by 6 PM"*) through Alexa, generating a validated multi-step action plan using LLM function calling, and sequentially executing tools over Model Context Protocol (MCP) Streamable HTTP transport before returning a voice confirmation.

- **Steps Taken:**  
  1. Configured `/api/alexa` to receive ASK `IntentRequest` (`CoordinateIntent` / `PlanIntent`).
  2. Invoked AI planner to produce structured JSON steps.
  3. Attempted to execute approved tool calls via MCP client over HTTP.
  4. Formatted final output text into Alexa `PlainText` response envelope.

- **Expected Result:**  
  The skill completes execution or provides progressive voice feedback while multi-tool agent execution is ongoing.

- **Actual Result:**  
  ASK strictly enforces an 8-second HTTP timeout window. Complex agent planning + tool execution took ~8.5 seconds on serverless cold starts, causing Alexa to drop the connection and speak: *"There was a problem with the requested skill's response."*

- **Severity Rating:** **High** (Blocks multi-step agent execution in a single voice turn).

- **Workaround Used:**  
  Architected a resilient two-phase human-in-the-loop voice handshake:
  1. **Phase 1 (Planning):** `PlanIntent` calls the LLM, validates the plan via Zod schemas, caches the plan in Alexa's `sessionAttributes`, speaks a concise natural summary of planned actions, and prompts the user (*"Should I proceed?"*) with `shouldEndSession: false` within 1.5 seconds.
  2. **Phase 2 (Execution):** When the user says *"Yes"* (`AMAZON.YesIntent`), the handler extracts `sessionAttributes.plan`, validates and registers it in-process, executes the MCP tools, and returns the completion speech.

- **Actionable Suggestion for the Alexa / Amazon Developer Team:**  
  1. Add native support for **Server-Sent Events (SSE) or HTTP Chunked Transfer** in ASK responses so custom skills can emit progressive audio tokens/phrases while an LLM reasoning loop or MCP tool call executes.
  2. Provide a native ASK `"AgentWait"` directive allowing up to 20–30 seconds for agentic tool execution with periodic audio heartbeat chimes.

---

### Incident 2: Session State Loss across Serverless Cold Starts in Voice Confirmation Loops

- **Specific Task Attempted:**  
  Maintaining pending agent execution plans waiting for user voice approval (`AMAZON.YesIntent`) when deployed on serverless environments (Vercel / AWS Lambda).

- **Steps Taken:**  
  1. Generated action plan during `PlanIntent`.
  2. Attempted to reference plan state in in-memory map across requests.
  3. Invoked `AMAZON.YesIntent` in next turn.

- **Expected Result:**  
  Pending plan remains available in memory for immediate tool execution.

- **Actual Result:**  
  On serverless hosting, the subsequent `YesIntent` request frequently routes to a different container or cold instance, resulting in lost state and *"No pending household plan found"*.

- **Severity Rating:** **Medium** (Impairs voice confirmation reliability).

- **Workaround Used:**  
  Serialized the full validated plan object directly inside Alexa's encrypted `sessionAttributes` envelope returned to the ASK service. On `AMAZON.YesIntent`, the handler deserializes and re-validates the plan from `session.attributes.plan`, dynamically re-registering it with the execution engine in 0ms.

- **Actionable Suggestion for the Alexa Developer Team:**  
  Provide native built-in session storage SDK helpers (e.g. built-in DynamoDB session adapters with 1-line activation in ASK SDK v2) for TypeScript/Node.js to eliminate boilerplate serialization.

---

### Incident 3: Standardizing Tool Calling between ASK and Model Context Protocol (MCP)

- **Specific Task Attempted:**  
  Exposing registered household tools (task management, reminders, parcel tracking) simultaneously to Alexa voice intents and external MCP clients without duplicate schema definitions.

- **Steps Taken:**  
  Attempted to find official Amazon tooling or bridging adapters between the Model Context Protocol (MCP) and Alexa Skills Kit interaction models.

- **Expected Result:**  
  An official or recommended bridging layer to map MCP tool declarations into Alexa custom intents or Alexa+ agent skills.

- **Actual Result:**  
  No official bridge exists between the open MCP specification (`@modelcontextprotocol/sdk`) and ASK schemas. Developers must manually write intent definitions, slot types, and JSON-RPC dispatchers.

- **Severity Rating:** **Medium** (Developer velocity friction).

- **Workaround Used:**  
  Created a single source of truth using TypeScript Zod schemas (`lib/validators/schemas.ts`) that automatically compile into:
  1. Official MCP tool declarations (`src/mcp-server/index.ts`).
  2. Gemini/LLM function declarations (`lib/ai/tools.ts`).
  3. Alexa slot extraction & validation logic (`app/api/alexa/route.ts`).

- **Actionable Suggestion for the Amazon Developer Team:**  
  Publish an official `@amazon/alexa-mcp-adapter` package that consumes an MCP server endpoint (Streamable HTTP) and automatically generates the corresponding Alexa Skill interaction model and request dispatcher.

---

## 💡 Feature Requests Summary

1. **Native Streaming Voice Synthesis for Agentic Skills**  
   - *Priority:* **Critical**  
   - *Rationale:* Essential for modern agentic AI where tool executions take several seconds.

2. **Official Alexa MCP Client Adapter**  
   - *Priority:* **Important**  
   - *Rationale:* Unlocks the entire ecosystem of thousands of open MCP servers for Alexa and Fire TV developers without bespoke intent boilerplate.

3. **Multimodal Agent Execution Cards for Echo Show & Fire TV**  
   - *Priority:* **Nice-to-have**  
   - *Rationale:* Allows voice skills to display live step-by-step execution status badges on ambient screens as tools complete.
