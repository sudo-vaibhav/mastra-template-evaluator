import { z } from "zod";
import { planMakerOutputSchema } from "./plan-maker.js";
import { generateObject } from "ai";
import { model } from "../../infra/model/index.js";
import { MastraClient } from "@mastra/client-js";

export const testerOutputSchema = z.array(
  z.object({
    id: z.string(),
    passed: z.boolean(),
    explanation: z.string(),
  })
);

// Internal schema used for per-step acceptance checks
const stepAcceptanceSchema = z.object({
  met: z.boolean(),
  justification: z.string(),
});

type Messages = Array<{ role: "user" | "assistant"; content: string }>; // minimal chat shape

function normalizeAgentName(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

async function discoverAgentsWithClient(
  client: MastraClient
): Promise<Array<{ id: string; name: string; toolsCount: number }>> {
  const result = await client.getAgents();
  const agents: Array<{ id: string; name: string; toolsCount: number }> = [];
  for (const [id, details] of Object.entries<any>(result || {})) {
    const name = String(details?.name ?? id);
    let toolsCount = 0;
    if (details && typeof details.tools === "object" && details.tools) {
      toolsCount = Object.keys(details.tools).length;
    } else {
      try {
        const agent = client.getAgent(id);
        const tools = (await agent.details()).tools;
        toolsCount = tools ? Object.keys(tools as any).length : 0;
      } catch {
        toolsCount = 0;
      }
    }
    agents.push({ id, name, toolsCount });
  }
  return agents;
}

async function sendChatWithClient(
  client: MastraClient,
  agentId: string,
  messages: Messages,
  threadId?: string
): Promise<string> {
  const agent = client.getAgent(agentId);
  const res: any = await agent.generate({ messages, threadId });
  if (!res) return "";
  if (typeof res === "string") return res;
  if (typeof res.text === "string") return res.text;
  if (typeof res.message === "string") return res.message;
  if (typeof res.content === "string") return res.content;
  if (Array.isArray(res.messages)) {
    const last = res.messages[res.messages.length - 1];
    if (last?.content) return String(last.content);
  }
  return JSON.stringify(res);
}

function buildAcceptancePrompt(
  plan: z.infer<typeof planMakerOutputSchema>["plans"][number],
  stepIndex: number,
  transcript: Array<{ step: number; user: string; assistant: string }>
) {
  return `You are an evaluator judging whether the plan's acceptance criteria are met so far.

Plan title: ${plan.title}
Claims targeted: ${plan.claims_targeted.join(", ")}
Success criteria (must all be satisfied):\n- ${plan.success_criteria.join("\n- ")}

Interaction transcript up to step ${stepIndex + 1} (latest last):
${transcript
  .map(
    (t) => `Step ${t.step}
User: ${t.user}
Assistant: ${t.assistant}`
  )
  .join("\n\n")}

Question: Based on the transcript so far, are the success criteria fully met? Respond with JSON { "met": boolean, "justification": string }.
`;
}

function buildFinalVerdictPrompt(
  plan: z.infer<typeof planMakerOutputSchema>["plans"][number],
  transcript: Array<{ step: number; user: string; assistant: string }>
) {
  return `You are an evaluator providing a final verdict for this plan.

Plan title: ${plan.title}
Claims targeted: ${plan.claims_targeted.join(", ")}
Success criteria (must all be satisfied):\n- ${plan.success_criteria.join("\n- ")}

Full interaction transcript (latest last):
${transcript
  .map(
    (t) => `Step ${t.step}
User: ${t.user}
Assistant: ${t.assistant}`
  )
  .join("\n\n")}

Return JSON with { "met": boolean, "justification": string }.
`;
}

export async function runPlansAgainstAgent(props: {
  port: string;
  mainAgent: string | null;
  plans: z.infer<typeof planMakerOutputSchema>["plans"];
}): Promise<z.infer<typeof testerOutputSchema>> {
  const baseUrl = `http://localhost:${props.port}/`;
  const client = new MastraClient({ baseUrl });
  const agents = await discoverAgentsWithClient(client);

  let chosenAgentId: string | undefined;
  if (props.mainAgent && agents.length) {
    const target = normalizeAgentName(props.mainAgent);
    for (const a of agents) {
      const n1 = normalizeAgentName(a.name);
      const n2 = normalizeAgentName(a.id);
      if (n1 === target || n2 === target) {
        chosenAgentId = a.id;
        break;
      }
    }
  }
  // If no matching agent is found, choose the agent with the most tools
  if (!chosenAgentId) {
    if (agents.length) {
      const withMostTools = agents.reduce((best, curr) =>
        curr.toolsCount > best.toolsCount ? curr : best
      );
      chosenAgentId = withMostTools.id;
    } else {
      chosenAgentId = "default";
    }
  }

  const results: Array<z.infer<typeof testerOutputSchema>[number]> = [];

  for (const plan of props.plans) {
    const messages: Messages = [];
    const transcript: Array<{ step: number; user: string; assistant: string }> =
      [];
    let met = false;
    let justification = "";
    const threadId = plan.id; // keep a stable thread per plan for multi-turn context
    const maxIters = Math.min(5, plan.steps.length);
    for (let i = 0; i < maxIters; i++) {
      const step = plan.steps[i]!;
      // Send user message
      messages.push({ role: "user", content: step.message });
      let assistantReply = "";
      try {
        assistantReply = await sendChatWithClient(
          client,
          chosenAgentId,
          messages,
          threadId
        );
      } catch (err: any) {
        assistantReply = `Error talking to agent: ${err?.message || String(err)}`;
      }
      messages.push({ role: "assistant", content: assistantReply });
      transcript.push({
        step: i + 1,
        user: step.message,
        assistant: assistantReply,
      });

      // Ask evaluator if success criteria are met so far
      try {
        const prompt = buildAcceptancePrompt(plan, i, transcript);
        const evalObj = (
          await generateObject({ model, prompt, schema: stepAcceptanceSchema })
        ).object;
        if (evalObj.met) {
          met = true;
          justification = evalObj.justification;
          break;
        }
        justification = evalObj.justification;
      } catch (e: any) {
        justification = `Evaluation error: ${e?.message || String(e)}`;
      }
    }

    // Final verdict if not already met
    if (!met) {
      try {
        const prompt = buildFinalVerdictPrompt(plan, transcript);
        const finalObj = (
          await generateObject({ model, prompt, schema: stepAcceptanceSchema })
        ).object;
        met = finalObj.met;
        justification = finalObj.justification;
      } catch (e: any) {
        justification =
          justification || `Final evaluation error: ${e?.message || String(e)}`;
      }
    }

    results.push({ id: plan.id, passed: met, explanation: justification });
  }

  return results;
}
