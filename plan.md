# Multi-Agent Workflow Architecture for High-Accuracy Project Evaluation

This architecture uses multiple AI agents and structured workflows to evaluate a project with high accuracy.
By dividing the task into specialized steps (video review, documentation analysis, promise extraction,
testing, and scoring), we achieve clearer logic and better performance than a single monolithic agent.
Each agent focuses on a specific domain or subtask (e.g. documentation or testing), which mirrors effective
team collaboration (similar to having separate roles for documentation, testing, etc.). Recent insights by
Andrew Ng and others affirm that such _agentic_ workflows – involving iterative refinement and multi-agent
collaboration – can outperform linear single-agent approaches. We outline below the overall pipeline
and each agent’s role, along with example system prompts and input/output schemas (using Zod) for each
component.

## Overall Architecture

### Key Components:

1. **Unique Project ID**: Each project evaluation is initiated with a unique UUID (projectId) for tracking. The system processes one project at a time, carrying this ID through all steps for correlation.

2. **Input (Markdown & Links)**: The input is a Markdown document (e.g. a README or project description) that may contain links (such as a YouTube video link for a demo). A preprocessing step extracts these links.

3. **Link Checking Workflow**: Before or during documentation analysis, an automated Link Checker (non-LLM workflow) validates the hyperlinks from the Markdown, identifying any dead links.

4. **Multi-Agent Pipeline**: The core evaluation uses a sequence of specialized LLM-powered agents:
   - **Video Review Agent** – Analyzes the project's YouTube demo/tutorial video (if provided) and summarizes key points
   - **Documentation Review Agent** – Analyzes the project's README/Documentation (Markdown), assessing clarity, completeness, and extracting important details
   - **Promise Extraction Agent** – Extracts the project's stated promises, features, or claims from the video and documentation
   - **Testing Agent** – Attempts to verify the promises/features by running the project or its tests
   - **Scoring Agent (Evaluator)** – Aggregates all information and evaluates the project against a rubric of criteria

5. **Orchestration & Model Routing**: A central orchestrator component coordinates these steps using OpenRouter (openrouter.ai) to route each agent's requests to an appropriate LLM model.
6. **Data Flow**: The output of each agent is structured (JSON) and feeds into the next step. The projectId ties together all outputs. After scoring, the results are stored or returned, keyed by the project's UUID for future reference.

---

Below we detail each agent/workflow, with its purpose, an example system prompt, and the expected input/output schema in Zod.

## 1. Video Review Agent

**Purpose:** Reviews a project’s demo or explainer video (e.g. a YouTube link) and summarizes the key
information. This agent focuses on extracting details relevant to the project’s goals, features, or usage
demonstrated in the video.

**System Prompt:** This prompt instructs the agent to act as an expert video content reviewer:

```
You are a Video Analysis Agent, specialized in summarizing technical project
demo videos.
You will be given a YouTube video URL (and/or a transcript of the video).
Your task: Watch or analyze the video and produce a concise summary of the key
points, focusing on the project's features, how it works, and any claims or
important details mentioned.
If the video is a tutorial, note the main steps or highlights. If any specific
promises or features are demonstrated, call those out.
If the video cannot be accessed or is too long to fully analyze, note that as an
issue.
Be objective and clear in your summary, using bullet points for distinct points
if appropriate.
```
**Input Schema (Zod):** The Video Review agent expects the project ID and the video link (or multiple links if
more than one video is provided):

```typescript
const VideoReviewInput = z.object({
  projectId: z.string().uuid(),
  videoUrls: z.array(z.string().url()).min(1) // one or more video URLs
});
```
**Output Schema (Zod):** The agent returns a summary of the video content, along with any specific findings:

```typescript
const VideoReviewOutput = z.object({
  projectId: z.string().uuid(),
  videoSummaries: z.array(z.object({
    videoUrl: z.string().url(),
    summary: z.string(), // Key points summary of the video
    importantPoints: z.array(z.string()).optional(), // (Optional) list of highlighted points
    videoAccessIssue: z.boolean().optional() // true if video was inaccessible or partially processed
  }))
});
```
_Explanation:_ In practice, an external tool or API may retrieve the video transcript which the LLM then
summarizes. The output contains a summary for each video URL. For example, importantPoints could
list critical features demonstrated. Any access issues (like dead link or transcript fetch failure) can be flagged
via videoAccessIssue. The projectId is echoed for traceability.

## 2. Documentation Review Agent

**Purpose:** Evaluates the project’s README or documentation provided in Markdown. This agent extracts key
information (project description, installation steps, usage, etc.), checks for completeness and clarity, and
identifies any obvious issues (e.g. missing sections or dead links). It also generates descriptive tags for the
project’s domain and technology stack for indexing/search.

**System Prompt:** We instruct this agent to act as a documentation analyst:

```
You are a Documentation Analyst Agent, an expert in reading and evaluating
project documentation.
You will be given the project's README or documentation in Markdown format.
Your tasks:
```
1. Summarize the project's purpose and main features as described in the
documentation.
2. Identify the technologies or frameworks used (for tagging).
3. Assess the documentation quality: Is it clear and complete? Note any missing
information or sections that could confuse users (e.g., missing installation
steps, poor formatting).
4. Extract all hyperlinks present (but do not visit them yourself). If provided
with a list of broken links (from a link checker tool), highlight which parts of
the documentation reference dead links.
5. Provide output as a structured summary, including a list of tags (keywords
for the project’s premise/tech stack), and mention any documentation issues.
Be thorough and objective in your analysis, using a neutral tone.

**Input Schema (Zod):** The Documentation agent needs the project ID, the markdown text, and optionally
the results of link checking (a list of URLs that were found to be broken):


```typescript
const DocReviewInput = z.object({
  projectId: z.string().uuid(),
  markdownContent: z.string(), // The README or documentation in Markdown
  brokenLinks: z.array(z.string().url()).optional() // (Optional) list of URLs found to be dead
});
```
**Output Schema (Zod):** The output includes a structured summary of the documentation, extracted tags,
and any issues noted:

```typescript
const DocReviewOutput = z.object({
  projectId: z.string().uuid(),
  docSummary: z.string(), // High-level summary of the project from the docs
  keyPoints: z.array(z.string()), // Important points or features mentioned
  tags: z.array(z.string()), // Tags for project premise/tech (e.g. ["AI", "Node.js", "Computer Vision"])
  documentationIssues: z.array(z.string()).optional(),
  links: z.array(z.object({
    url: z.string().url(),
    reference: z.string() // e.g. section or context where the link appears
  }))
});
```
Here, documentationIssues might include notes like "Installation instructions missing" or "Broken link
to dataset in Usage section". The links array lists all hyperlinks found in the docs and where they were
referenced (this can help the orchestrator cross-check with the link checker service). The tags field is
crucial for enabling search by topic or technology.

_Explanation:_ The Documentation Review agent’s analysis ensures we understand the project’s intent and
context. It provides tags for indexing (like programming languages, domain keywords) and flags any
obvious documentation gaps. This sets the stage for evaluating promises and testing. (Note: actual link
validation is done by a separate tool; the agent just reports if any brokenLinks were provided in input,
integrating that info into documentationIssues.)

## 3. Promise Extraction Agent

**Purpose:** Extracts the promises or claims the project makes. “Promises” here means any stated features,
goals, or guarantees in the documentation (and possibly the video). This agent compiles a list of things the
project is supposed to do or deliver, which will later be verified by testing.

**System Prompt:** We prompt the agent to identify all explicit or implicit promises:


```
You are a Promise Extraction Agent. Your job is to identify all key promises,
claims, or stated features about the project.
You will be given the project documentation text (and possibly a summary of any
promo video).
Extract each distinct promise or claim the project makes. A promise could be a
feature ("This tool can process 1000 images per second"), a guarantee of
performance, or a claim of compliance/standards, etc.
List each promise as a short statement, ideally quoting or paraphrasing from the
source.
If possible, note the source (e.g. "stated in README - Introduction section" or
"stated in video") for each promise.
Your output should be a list of promises/features that the project intends to
fulfill.
```
**Input Schema (Zod):** The Promise Extraction agent gets the project ID and the combined relevant text from
previous steps (we can feed it the entire documentation text and possibly the video summary for context):

```typescript
const PromiseExtractionInput = z.object({
  projectId: z.string().uuid(),
  documentationText: z.string(), // The full text of documentation (or a relevant subset)
  videoSummary: z.string().optional() // Summary of video if available, to catch any additional claims
});
```
**Output Schema (Zod):** The agent outputs a list of promises with optional source references:

```typescript
const PromiseExtractionOutput = z.object({
  projectId: z.string().uuid(),
  promises: z.array(z.object({
    text: z.string(), // The promise or claim (possibly paraphrased or quoted)
    source: z.string().optional() // e.g. "README - Features section" or "Video"
  }))
});
```
_Explanation:_ For example, promises might include statements like _“Offers real-time analytics with less than
100ms latency”_ or _“Compatible with Linux, Mac, and Windows”_. Each such claim is captured. These will directly
inform what the Testing agent should verify and what the Scoring agent will evaluate against. Having a clear
list of promised features is crucial for systematic testing.


## 4. Testing Agent

**Purpose:** Attempts to verify each promise/feature by interacting with the project (this could involve running
code, executing a test suite, or performing sample tasks). The agent uses tools or an execution environment
to test whether the project meets its promises. This step provides empirical evidence of the project’s
functionality and reliability.

**System Prompt:** We instruct the Testing agent to behave like a QA tester or automation script:

```
You are a Testing Agent tasked with validating the project's features and
promises.
You will be given a list of the project's promises/features and access to tools
or an environment to test the project.
For each promise:
```
- Devise a way to test it (e.g., run a provided test suite, execute specific
functions, or simulate user behavior).
- Determine whether the promise holds true (Pass) or not (Fail), based on the
results.
If the project has an automated test suite or instructions, run those and report
results. Otherwise, perform a reasonable check for each claim (you may generate
and run code or commands if necessary).
Collect any relevant output, error logs, or observations during testing.
Your output should detail each promise, how it was tested, and the outcome
(Passed/Failed), including any pertinent details (e.g., which tests failed or
what went wrong).
Be concise but precise in reporting results.

**Input Schema (Zod):** The Testing agent needs the project context and the list of promises to verify. It may
also need access details like repository URL or installation instructions, but we assume those are available
through context or environment:

```typescript
const TestingAgentInput = z.object({
  projectId: z.string().uuid(),
  promises: z.array(z.object({
    text: z.string(),
    // We might include more info like expected behavior or test criteria if available
  })),
  repositoryUrl: z.string().url().optional(), // URL to project repo or code (if needed)
  setupInstructions: z.string().optional() // Any necessary instructions to run the project
});
```
**Output Schema (Zod):** The Testing agent returns results for each promise tested:


```typescript
const TestingAgentOutput = z.object({
  projectId: z.string().uuid(),
  testResults: z.array(z.object({
    promise: z.string(), // The promise text that was tested
    outcome: z.enum(['Passed', 'Failed', 'NotTested']), // result of test
    details: z.string().optional() // Additional info (e.g., error messages, log excerpts, reason if not tested)
  })),
  overallPassed: z.boolean() // True if all tested promises passed, false if any failed
});
```
_Explanation:_ The Testing agent likely operates in conjunction with a tool API for execution (for example,
using a sandbox or continuous integration service). It tries to follow the project’s instructions to install/run
tests, or directly invokes functionality if possible. In the output, each promise is marked Passed if the
behavior was as expected, Failed if not (with details explaining, e.g., "Test X in suite failed" or "Output
was not as claimed"), or NotTested if a promise couldn’t be verified (perhaps due to environment
limitations or lack of information). The overallPassed flag gives a quick view of whether the project
delivered on all promises. This empirical step grounds the final evaluation in actual test evidence.

## 5. Scoring Agent (Evaluator with Writer–Reviewer Pattern)

**Purpose:** Produces a final evaluation of the project using a defined rubric. This agent considers all prior
outputs (documentation quality, video insights, promises, test results, etc.) and scores the project on
various criteria. It also provides narrative feedback. To maximize accuracy, this agent uses a two-pass _writer-
reviewer_ approach: first drafting an evaluation, then self-critiquing and refining it before finalizing. Using an
LLM as a judge/evaluator in this way has become a common technique to approximate human evaluations
, and incorporating a self-review step (reflection) helps ensure the assessment is thorough and correct
.

**Rubric:** We assume a predefined set of criteria (rubric) for evaluation. For example, the rubric might include
categories like _Documentation Quality_ , _Feature Completeness_ , _Usability_ , _Performance_ , _Innovation_ , etc., each
with a weight or maximum score. The Scoring agent uses these criteria to structure its evaluation. (The
rubric can be provided as part of the system prompt or as structured input.)

**System Prompt:** We give the Scoring agent a detailed instruction, including the rubric guidelines. For
instance:

```
You are an Evaluation Agent tasked with scoring the project against a set of
criteria and providing feedback.
You have access to all information about the project:
```
- Documentation analysis (clarity, completeness, issues),
- Video summary (key features demonstrated),
- Extracted promises/claims,
- Test results for those promises.

```
4
5
```

```
Rubric (Criteria to evaluate):
```
1. Documentation Quality – clarity, completeness, ease of understanding.
2. Feature Completeness – does the project deliver all promised features?
3. Reliability – does it work without errors (based on tests)?
4. Innovation/Impact – how novel or significant is the project solution?
5. **(Add other criteria as needed)**.

```
Scoring Instructions:
```
- For each criterion, assign a score from 1 to 10 (10 = excellent). Justify the
score with evidence.
- Provide an overall assessment summarizing the project's strengths and
weaknesses.
- Mention the tags/keywords for the project domain/tech.

```
Process:
First, draft an evaluation considering each criterion and the evidence. Then
**review your own draft** critically for any inaccuracies or gaps (the "writer-
reviewer" process). Improve the evaluation if needed before finalizing.
```
```
Your output should include:
```
- Scores for each criterion (with brief justifications).
- An overall score or rating.
- A written summary of the evaluation (paragraph form).
- Any suggestions for improvement.
Structure the output in JSON as specified, and keep the tone constructive and
professional.

In this prompt, the agent is explicitly instructed to perform self-reflection on its output. This _Reflection_
approach (having the model critique and refine its answer) is known to significantly enhance quality. By
investing more tokens in this final step, we aim to catch inconsistencies and ensure the scoring is aligned
with the evidence. (The agent might internally produce a draft and then a revised answer, but ultimately we
get one finalized result.)

**Input Schema (Zod):** The Scoring agent’s input includes the aggregated data from all previous steps and
the rubric. For clarity, we define a schema that contains sub-objects for each agent’s outputs:

```typescript
const ScoringAgentInput = z.object({
  projectId: z.string().uuid(),
  rubric: z.array(z.object({ // Evaluation criteria
    criterion: z.string(),
    description: z.string().optional(),
    weight: z.number().optional() // weights if applicable
  })),
  docSummary: z.string(), // Summary of documentation (from DocReviewOutput)
  documentationIssues: z.array(z.string()),
  tags: z.array(z.string()),
  videoSummary: z.string().optional(), // Combined summary if multiple videos
  promises: z.array(z.string()), // List of promises (texts only for simplicity)
  testResults: z.array(z.object({ // Results for each promise
    promise: z.string(),
    outcome: z.string(),
    details: z.string().optional()
  }))
});
```
_(Note: In an actual implementation, the input might directly include the full structured outputs from previous
agents, but here it's simplified. The Scoring agent basically receives everything it needs: the rubric, the doc
analysis results, the promises list, and test outcomes.)_

**Output Schema (Zod):** The Scoring agent produces a comprehensive evaluation report:

```typescript
const ScoringAgentOutput = z.object({
  projectId: z.string().uuid(),
  scores: z.array(z.object({ // Score for each criterion
    criterion: z.string(),
    score: z.number().min(1).max(10),
    justification: z.string()
  })),
  overallScore: z.number().min(1).max(10),
  evaluation: z.string(), // A written summary of the evaluation (feedback)
  tags: z.array(z.string()) // Reiterating the project tags for reference
});
```
For example, a scores entry might be: { criterion: "Documentation Quality", score: 8,
justification: "Clear README with installation steps, only missing troubleshooting
section." }. The overallScore could be an average or weighted result, or a qualitative rating. The
evaluation field contains the final written feedback (which the agent will have refined via self-review).
The tags are included to confirm the project’s categories (carried over from documentation analysis).

_Explanation:_ Using an LLM as a judge allows flexible, nuanced evaluation of open-ended aspects (like how
well documentation is written) which are hard to quantify with automated tests. The writer–reviewer
pattern (the agent reflecting on its answer) helps catch errors or unsupported claims in the evaluation,
improving accuracy. By the end of this stage, we have a detailed assessment of the project across
defined dimensions, backed by both analytical reasoning and empirical test results.

```
4
```
```
5
```

## Conclusion

This multi-agent architecture orchestrates specialized LLM agents and tools to achieve a thorough
evaluation of a project. The approach leverages the strength of each agent: one analyzes video content,
another scrutinizes documentation and extracts metadata (tags), another pulls out promised features,
followed by an agent that empirically tests those features, and finally an evaluator agent that scores the
project against a rubric. The use of multiple focused agents improves clarity and reliability of the process. Furthermore, incorporating an iterative self-review in the final scoring step capitalizes on reflection
techniques to ensure high accuracy in the evaluation.

By assigning a unique UUID per project and using structured input/output schemas, the system can track
progress and results for each project in a reproducible way. The inclusion of tags for each project (derived
from content) facilitates easy searching and filtering in a larger database of evaluations. Meanwhile, the
rubric-driven scoring provides transparency and consistency in how projects are rated.

Finally, using OpenRouter models allows the system to route tasks to the most appropriate LLM for each
agent’s needs (balancing accuracy and cost). For instance, simpler summarization tasks might use a faster,
cheaper model, whereas the complex scoring step might use a top-tier model for best results. This flexibility
ensures efficiency without compromising on the quality of critical outputs.

In summary, this architecture provides a robust, multi-step evaluation pipeline. It harnesses multi-agent
collaboration and iterative refinement to deliver high-accuracy results, aligning with current best practices
in AI agent design for complex workflows. All agents communicate through well-defined interfaces
(as shown in the Zod schemas), making the system modular and maintainable. This design can be extended
or adjusted (e.g., adding more criteria in the rubric, or additional agents for security analysis, etc.) as
needed, but the presented framework covers the key components to review a project end-to-end with a
high degree of confidence in the outcome.

## References

- [Multi-Agent AI Systems: When to Expand From a Single Agent](https://www.willowtreeapps.com/craft/multi-agent-ai-systems-when-to-expand)
- [Design Patterns for AI Agents: Using Autogen for Effective Multi-Agent Collaboration](https://medium.com/@LakshmiNarayana_U/design-patterns-for-ai-agents-using-autogen-for-effective-multi-agent-collaboration-5f1067a7c63b)
- [Exploring Agentic Workflows in AI: A Practical Approach with CrewAI, OpeRouter.ai and OpenHermes](https://blog.stackademic.com/exploring-agentic-workflows-in-ai-a-practical-approach-with-crewai-operouter-ai-and-openhermes-cb7abd493285)
- [LLM-as-a-judge: a complete guide to using LLMs for evaluations](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)

