# 🏆 Mastra.Build Hackathon Evaluator

**Automated, unbiased evaluation system for Mastra.Build hackathon submissions using advanced multi-agent workflows.**

This system revolutionizes hackathon judging by replacing subjective manual reviews with **systematic, data-driven evaluation**. Built specifically for the Mastra.Build hackathon, it automatically evaluates submitted projects, validates claimed features through live testing, and provides sponsor-aligned scoring with track eligibility detection.

## 🎯 Core Purpose

**Problem**: Mastra.Build hackathon judging requires evaluating diverse AI agent projects consistently across multiple sponsor prize categories.

**Solution**: An AI-powered evaluation pipeline that:
- **🔍 Extracts verifiable claims** from project documentation and demo videos
- **🧪 Tests functionality** through automated agent interactions  
- **⭐ Scores objectively** using standardized criteria across all submissions
- **🏷️ Tags for sponsor tracks** with automatic eligibility detection for Smithery, WorkOS, Browserbase, Arcade, Chroma, Recall, and Confident AI prizes
- **📊 Ranks submissions** with transparent, auditable results

## 🌟 Why This Matters for Mastra.Build

This system transforms Mastra.Build evaluation from **"subjective demos" to "empirical validation"**:

- **⚖️ Eliminates judging bias** through systematic evaluation criteria
- **🎯 Validates AI agent functionality** instead of relying on presentations alone  
- **🏆 Automatically detects sponsor alignment** for prize categories (MCP servers, auth integration, web browsing, etc.)
- **⚡ Scales to evaluate** hundreds of Mastra framework submissions efficiently
- **📈 Provides detailed feedback** to help Mastra community members improve their agents

## 🏆 Sponsor Prize Track Detection

A key differentiator of this evaluation system is **automated sponsor alignment detection**. The AI scorer analyzes project dependencies, functionality, and implementation patterns to identify eligibility for specific sponsor prize categories:

### 📋 Mastra.Build Prize Categories
- **🥇 Best overall** (judged by Mastra)
- **🔧 Best MCP server** (judged by Smithery)
- **⭐ Bonus award: Best use of Smithery** (Switch2)
- **🤖 Best use of AgentNetwork** (judged by Mastra)
- **🔐 Best use of auth** (judged by WorkOS)
- **🌐 Best use of web browsing** (judged by Browserbase)
- **🛠️ Best use of tool provider** (judged by Arcade)
- **📚 Best RAG template** (judged by Chroma)
- **⚡ Best productivity** (judged by Mastra)
- **💻 Best coding agent** (judged by Mastra)
- **💰 Best crypto agent** (judged by Recall)
- **🧪 Best use of Evals** (judged by Confident AI)
- **🎯 Shane's favorite** (judged by Shane)
- **😄 Funniest** (judged by Abhi)

### 🎯 Automated Tag Detection Process

The system automatically analyzes:
- **📦 Package Dependencies**: Detects `@smithery/sdk`, `@workos/node`, `browserbase`, `@arcadeai/arcadejs`, `chromadb`, etc.
- **🔍 Code Patterns**: Identifies authentication flows, web scraping, RAG implementations, MCP server structures
- **📝 Documentation Keywords**: Extracts mentions of sponsor technologies and use cases
- **🧪 Functionality Testing**: Validates actual integration with sponsor services

> **⚠️ Important Note**: This system is designed to **assist and accelerate** the evaluation process, not replace human judgment. While it provides systematic analysis and scoring, **human review remains essential** for final prize decisions, especially for subjective categories like "Shane's favorite" and "Funniest". The AI evaluation serves as a comprehensive first-pass filter and detailed analysis tool for judges.

### 🎯 Key Features
- **Domain-Driven Design (DDD)** - Clean architecture with well-defined domain boundaries
- **Dependency Injection** - Leverages InversifyJS for loose coupling and testability
- **Multi-Agent Coordination** - Specialized agents working in orchestrated harmony
- **Template Ready** - A complete Mastra template showcasing advanced patterns

## 🏗️ Architecture

The system uses a multi-agent pipeline with the following specialized components:

### 🤖 Core Agents
- **📋 Template Reviewer Agent** - Main evaluation agent that coordinates the assessment process
- **📚 Documentation Review Agent** - Analyzes project documentation for clarity, completeness, and extracts metadata
- **🎯 Promise Extraction Agent** - Identifies and extracts stated features, claims, and guarantees from documentation
- **🧪 Testing Agent** - Verifies promises through automated testing and validation
- **⭐ Scoring Agent** - Provides final evaluation using a writer-reviewer pattern for high accuracy

### 🔧 Architecture Features
- **🆔 Unique Project ID**: Each evaluation uses a UUID for tracking and correlation
- **📦 Structured Input/Output**: All agents communicate through well-defined Zod schemas
- **🔀 Model Routing**: Uses OpenRouter for optimal LLM selection per task
- **🔗 Link Checking**: Automated validation of documentation hyperlinks
- **🏷️ Tag Generation**: Automatic keyword extraction for searchability

## 🔄 Template Reviewer Workflow Architecture

The heart of this system is the **template-reviewer-workflow** (`src/mastra/workflows/template-reviewer-workflow/`), a sophisticated multi-step evaluation pipeline that demonstrates advanced workflow orchestration patterns.

### 📋 Workflow Overview

The template reviewer workflow implements a **4-phase evaluation process** with parallel execution where possible:

```typescript
templateReviewerWorkflow = createWorkflow({
  id: "template-reviewer-workflow",
  description: "Coordinator that launches the full template-review workflow",
  inputSchema: templateReviewerWorkflowInputSchema,
  outputSchema: templateReviewerWorkflowOutputSchema,
})
.then(createStep({ id: "clone-project" }))      // Phase 1: Setup
.parallel([                                      // Phase 2: Parallel Analysis
  createStep({ id: "setup-project-repo" }),
  createStep({ id: "claims-extractor" })
])
.then(createStep({ id: "executor-and-scorer" })) // Phase 3: Testing & Scoring
.commit();
```

### 🔧 Core Workflow Components

#### 1. **📊 Project Setup & Cloning** (`index.ts:55-77`)
- Creates new project entity with UUID tracking
- Persists project metadata to database
- Initializes evaluation context with environment configuration

#### 2. **🔍 Claims Extractor** (`claim-extractor.ts`)
**Purpose**: Systematically extracts present-tense capability claims from project documentation and video transcripts.

Key features:
- **📝 Dual-source analysis**: Processes both documentation and video transcripts
- **🎯 Present-tense filtering**: Distinguishes between current capabilities vs future promises
- **🏷️ Structured extraction**: Outputs standardized claim objects with evidence references
- **🤖 Primary agent detection**: Identifies the main agent in kebab-case format

```typescript
export const claimsSchema = z.object({
  mainAgent: z.string().nullable().describe("kebab-case name of the primary agent, or null"),
  claims: z.array(z.object({
    name: z.string().describe("Concise, verb-first summary (≤ 10 words)"),
    description: z.string().describe("Full claim text with ≤ 25-word evidence snippet")
  }))
});
```

**Why it's critical**: Claims extraction forms the foundation for all subsequent testing and evaluation. Without accurate claim identification, the testing phase cannot validate the right functionality.

#### 3. **📋 Plan Maker** (`plan-maker.ts`)
**Purpose**: Generates comprehensive test plans that validate extracted claims through systematic chat-based interactions.

This component is **strategically vital** because it:
- **🎯 Bridges claims to testing**: Converts abstract capability claims into concrete, executable test scenarios
- **📚 Resource-aware planning**: Leverages a curated resource kit (PDFs, CSVs, websites, locations) for realistic testing
- **🔄 Multi-plan generation**: Creates exactly 3 complementary test plans to maximize claim coverage
- **💬 Chat-based validation**: Designs conversational tests that mirror real user interactions

```typescript
export const planMakerOutputSchema = z.object({
  plans: z.array(z.object({
    id: z.enum(['plan-1', 'plan-2', 'plan-3']),
    title: z.string().min(3).max(120),
    claims_targeted: z.array(z.string()).min(1),
    steps: z.array(z.object({
      message: z.string().min(1),
      expected_agent_behavior: z.string().min(1),
    })).min(2),
    success_criteria: z.array(z.string()).min(1),
    resourcesToUse: z.array(z.object({name: z.string(), url: z.string().nullable()}))
  })).length(3)
});
```

**Resource Kit Integration**:
- **📄 Document Processing**: UDHR, Sherlock Holmes stories, AI Agent principles
- **📊 Data Analysis**: Iris dataset, Penguins dataset, Apple stock data  
- **🌐 Web Content**: Hacker News, Wikipedia pages
- **🌍 Location Data**: Coordinates for weather-related testing

#### 4. **🧪 Tester Component** (`tester.ts`)
**Purpose**: Executes the generated test plans and validates agent responses against success criteria.

```typescript
export const testerOutputSchema = z.array(z.object({
  id: z.string(),           // Links back to plan-1, plan-2, plan-3
  passed: z.boolean(),      // Binary pass/fail result
  explanation: z.string(),  // Detailed reasoning for the result
}));
```

#### 5. **⭐ Scorer Component** (`scorer.ts`)
**Purpose**: Provides comprehensive evaluation across multiple dimensions with detailed explanations.

```typescript
export const scorerOutputSchema = z.object({
  descriptionQuality: z.object({ score: z.number().min(1).max(5), explanation: z.string() }),
  tests: testerOutputSchema,  // Integration with test results
  appeal: z.object({ score: z.number().min(1).max(5), explanation: z.string() }),
  creativity: z.object({ score: z.number().min(1).max(5), explanation: z.string() }),
  architecture: z.object({
    agents: z.object({ count: z.number() }),
    tools: z.object({ count: z.number() }),
    workflows: z.object({ count: z.number() }),
  }),
  tags: z.array(z.string()),  // Automatic categorization
});
```

### 🔄 Workflow Execution Flow

1. **📥 Input Processing**: Accepts project name, repository URL, description, video URL, and optional environment configuration
2. **🔄 Parallel Phase**: 
   - **Repo Setup**: Clones repository, runs `npm install`, creates `.env` file
   - **Claims Analysis**: Extracts video transcript, analyzes documentation, identifies capabilities
3. **📋 Plan Generation**: Creates 3 targeted test plans based on extracted claims
4. **🧪 Test Execution**: Runs chat-based tests against the deployed project
5. **⭐ Final Scoring**: Generates comprehensive evaluation with detailed explanations

### 🎯 Why This Architecture Matters

#### **🔍 Systematic Claim Validation**
Unlike ad-hoc evaluation approaches, this workflow ensures **every stated capability** is systematically:
- **📝 Documented** (claims extractor)
- **📋 Planned for testing** (plan maker)  
- **🧪 Empirically validated** (tester)
- **⭐ Scored with evidence** (scorer)

#### **🔄 Reproducible Evaluation Process**
The workflow creates an **audit trail** from initial claims through final scores, enabling:
- **🔍 Traceability**: Every score traces back to specific test results
- **🔄 Reproducibility**: Same project always produces consistent evaluations
- **📊 Comparative Analysis**: Standardized scoring enables project comparisons

#### **⚡ Parallel Processing Optimization**
Smart parallelization reduces evaluation time:
- **Repository setup** and **claims extraction** run concurrently
- **Video processing** happens alongside **documentation analysis**
- **Database persistence** is optimized for workflow state management

## 💡 Real-World Example: Evaluating Deep Research Assistant

Let's walk through how our template reviewer workflow would evaluate the [Deep Research Assistant](https://github.com/mastra-ai/template-deep-research.git) project:

### 📥 Input Processing
```json
{
  "name": "Deep Research Assistant",
  "repoURLOrShorthand": "https://github.com/mastra-ai/template-deep-research.git",
  "description": "Advanced AI deep research assistant with human-in-the-loop workflows",
  "videoURL": "https://youtube.com/watch?v=demo-video",
  "envConfig": {
    "EXA_API_KEY": "demo-key-for-testing"
  }
}
```

### 🔍 Claims Extraction Output
Our claims extractor would identify these present-tense capabilities:

```json
{
  "mainAgent": "research-agent",
  "claims": [
    {
      "name": "Implements interactive human-in-loop research system",
      "description": "Creates an interactive, human-in-the-loop research system that allows users to explore topics - README line 3"
    },
    {
      "name": "Searches web using Exa API integration", 
      "description": "webSearchTool: Searches the web using the Exa API for relevant information - README line 15"
    },
    {
      "name": "Evaluates research result relevance automatically",
      "description": "evaluateResultTool: Assesses result relevance to the research topic - README line 16"
    },
    {
      "name": "Generates comprehensive markdown reports",
      "description": "reportAgent: Transforms research findings into comprehensive markdown reports - README line 20"
    },
    {
      "name": "Extracts key learnings and follow-up questions",
      "description": "extractLearningsTool: Identifies key learnings and generates follow-up questions - README line 17"
    }
  ]
}
```

### 📋 Generated Test Plans
Our plan maker would create 3 targeted **chat-based test plans**:

#### **Plan 1: End-to-End Research Process**
```json
{
  "id": "plan-1",
  "title": "Validate complete research workflow with report generation",
  "claims_targeted": [
    "Searches web using Exa API integration",
    "Generates comprehensive markdown reports"
  ],
  "steps": [
    {
      "message": "I need you to research 'AI agent frameworks in 2024' and provide me with a comprehensive analysis. Please use the Principles of Building AI Agents document at https://hs-47815345.f.hubspotemail.net/hub/47815345/hubfs/book/principles_2nd_edition_updated.pdf as a reference.",
      "expected_agent_behavior": "Should initiate web search using Exa API, retrieve relevant information, and reference the provided PDF"
    },
    {
      "message": "Now generate a final research report in markdown format with your findings.",
      "expected_agent_behavior": "Should produce a well-structured markdown report containing research findings, analysis, and references"
    }
  ],
  "success_criteria": [
    "Successfully searches web using Exa API",
    "References the provided PDF document",
    "Generates properly formatted markdown report",
    "Report contains research findings and analysis"
  ],
  "resourcesToUse": [
    {"name": "AI Agent Principles PDF", "url": "https://hs-47815345.f.hubspotemail.net/hub/47815345/hubfs/book/principles_2nd_edition_updated.pdf"}
  ]
}
```

#### **Plan 2: Result Evaluation and Learning Extraction**
```json
{
  "id": "plan-2", 
  "title": "Test relevance evaluation and learning extraction capabilities",
  "claims_targeted": [
    "Evaluates research result relevance automatically",
    "Extracts key learnings and follow-up questions"
  ],
  "steps": [
    {
      "message": "Research Python programming trends using information from https://en.wikipedia.org/wiki/Python_(programming_language) and evaluate how relevant each piece of information is to modern software development.",
      "expected_agent_behavior": "Should retrieve Wikipedia content, assess relevance of different sections, and provide relevance ratings"
    },
    {
      "message": "Based on your research, extract the top 3 key learnings and suggest 2 follow-up research questions.",
      "expected_agent_behavior": "Should identify key insights from the research and generate relevant follow-up questions for deeper investigation"
    }
  ],
  "success_criteria": [
    "Demonstrates relevance evaluation for search results",
    "Extracts meaningful key learnings from research data",
    "Generates logical follow-up research questions",
    "Shows clear reasoning for relevance assessments"
  ],
  "resourcesToUse": [
    {"name": "Wikipedia Python Page", "url": "https://en.wikipedia.org/wiki/Python_(programming_language)"}
  ]
}
```

#### **Plan 3: Multi-Source Research Integration**
```json
{
  "id": "plan-3",
  "title": "Validate research across multiple data sources and formats",
  "claims_targeted": [
    "Implements interactive human-in-loop research system",
    "Searches web using Exa API integration"
  ],
  "steps": [
    {
      "message": "Research current trends in data science by analyzing information from https://news.ycombinator.com/ and correlating it with data patterns from the Iris dataset at https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv",
      "expected_agent_behavior": "Should fetch and analyze both web content from Hacker News and CSV data, then find correlations or connections"
    },
    {
      "message": "Summarize how the current discussions on Hacker News relate to data science methodologies, using examples from the Iris dataset analysis.",
      "expected_agent_behavior": "Should synthesize findings from both sources and demonstrate connections between current discussions and classic data science examples"
    }
  ],
  "success_criteria": [
    "Successfully processes both web content and CSV data",
    "Demonstrates integration across multiple data formats", 
    "Provides meaningful synthesis of disparate information sources",
    "Shows ability to correlate web discussions with data analysis"
  ],
  "resourcesToUse": [
    {"name": "Hacker News", "url": "https://news.ycombinator.com/"},
    {"name": "Iris Dataset", "url": "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv"}
  ]
}
```

### 🧪 Sample Test Results
```json
[
  {
    "id": "plan-1",
    "passed": true,
    "explanation": "Successfully completed end-to-end research with Exa API integration. Generated comprehensive markdown report with proper structure and citations."
  },
  {
    "id": "plan-2", 
    "passed": true,
    "explanation": "Demonstrated clear relevance evaluation process. Extracted meaningful insights and generated logical follow-up questions."
  },
  {
    "id": "plan-3",
    "passed": false,
    "explanation": "Successfully processed both data sources but failed to establish meaningful correlations between HN discussions and Iris dataset patterns."
  }
]
```

### ⭐ Final Evaluation Score
```json
{
  "descriptionQuality": {
    "score": 4,
    "explanation": "Clear, well-structured documentation with good technical detail and usage examples"
  },
  "tests": [
    {"id": "plan-1", "passed": true, "explanation": "End-to-end research workflow validated"},
    {"id": "plan-2", "passed": true, "explanation": "Relevance evaluation and learning extraction working"}, 
    {"id": "plan-3", "passed": false, "explanation": "Multi-source integration needs improvement"}
  ],
  "appeal": {
    "score": 4,
    "explanation": "Compelling use case for research automation with clear business value"
  },
  "creativity": {
    "score": 3,
    "explanation": "Good implementation of known patterns but limited novel approaches"
  },
  "architecture": {
    "agents": {"count": 2},
    "tools": {"count": 3},
    "workflows": {"count": 2}
  },
  "tags": [
    "exa-api", 
    "web-search", 
    "report-generation", 
    "human-in-the-loop",
    "eligible-browserbase",
    "eligible-productivity", 
    "eligible-best-overall"
  ]
}
```

### 🏆 Sponsor Track Eligibility Detection

The AI automatically detected sponsor eligibilities based on:

- **🌐 `eligible-browserbase`**: Uses Exa API for web search (similar to web browsing functionality)
- **⚡ `eligible-productivity`**: Research automation enhances user productivity 
- **🥇 `eligible-best-overall`**: Solid implementation with good architecture and functionality

**Additional tags would be generated for projects using**:
- **`eligible-smithery`**: Projects with `@smithery/sdk` dependency
- **`eligible-workos`**: Authentication flows using `@workos/node`
- **`eligible-arcade`**: Tool integrations using `@arcadeai/arcadejs`
- **`eligible-chroma`**: RAG implementations with `chromadb` 
- **`eligible-recall`**: Crypto/blockchain functionality
- **`eligible-confident-ai`**: Evaluation frameworks integration

### 🎯 Key Advantages Over Manual Review

1. **📊 Turn-by-Turn Testing**: Each message tests specific functionality without relying on workflow control
2. **🔗 URL Embedding**: All resources (PDFs, websites, datasets) are provided directly in chat messages
3. **🧪 Functional Validation**: Tests actual agent responses against concrete success criteria
4. **📈 Reproducible Results**: Same inputs produce consistent evaluation outcomes
5. **🎯 Claim-Driven Testing**: Every test directly validates a stated project capability
6. **🏆 Automated Prize Detection**: AI identifies sponsor track eligibility without human bias

### 🏛️ Domain-Driven Design (DDD) Implementation
This template demonstrates **production-grade DDD patterns** - the first and only example in Mastra's template library:

#### 📋 **Project Aggregate** (`domain/aggregates/project/`)
```typescript
// Complete aggregate with invariants and business rules
class ProjectAggregate {
  private constructor(private props: ProjectProps) {}
  
  static create(data: CreateProjectData): Either<Error, ProjectAggregate>
  evaluateDocumentation(): DocumentationScore
  extractPromises(): Promise[]
  // Encapsulated business logic with domain validation
}
```

#### 💎 **Value Objects** (`shared/value-objects/`)
```typescript
// Immutable domain concepts
class ProjectId extends ValueObject<string> {
  static create(value: string): Either<Error, ProjectId>
  // Type-safe identifiers with validation
}
```

#### 🔄 **Use Cases** (`application/use-cases/`)
```typescript
// Clean application services
class CreateProjectUseCase {
  execute(command: CreateProjectCommand): Promise<Either<Error, ProjectDto>>
  // Orchestrates domain operations without business logic
}
```

### 💉 Dependency Injection Architecture
**Comprehensive IoC implementation** using InversifyJS - completely missing from current templates:

#### 🔧 **Container Setup** (`index.ts`)
```typescript
import "reflect-metadata";
import { Container } from "inversify";

const container = new Container();
container.bind(Config).toDynamicValue(() => new Config()).inSingletonScope();
container.bind(DB_SYMBOL).toConstantValue(getDB(container));

// Professional DI container with proper lifecycle management
```

#### 🎭 **Service Abstractions** (`infra/repositories/`)
```typescript
@injectable()
class ProjectRepository implements IProjectRepository {
  constructor(@inject(DB_SYMBOL) private db: Database) {}
  // Clean dependency injection with interface segregation
}
```

#### 🧪 **Testability Benefits**
```typescript
// Easy mocking for unit tests
const mockRepo = mock<IProjectRepository>();
container.rebind(PROJECT_REPO_SYMBOL).toConstantValue(mockRepo);
// Dependency injection enables effortless testing
```

## 📁 Project Structure

```
src/mastra/
├── 🤖 agents/           # AI agents for specialized evaluation tasks
│   ├── template-reviewer-agent.ts    # 📋 Main coordinator agent
│   └── weather-agent.ts              # 🌤️ Example weather agent
├── 🔄 application/      # Use cases and application logic
│   └── use-cases/       # 🎯 Domain-specific use cases
│       ├── adapter.ts   # 🔌 External service adapters
│       ├── base.ts      # 🏗️ Base use case patterns
│       └── project/     # 📊 Project evaluation workflows
├── 🏛️ domain/          # Domain entities and business logic
│   ├── aggregates/      # 📁 Domain aggregates and configuration
│   │   ├── config.ts    # ⚙️ Application configuration
│   │   └── project/     # 📋 Project domain model
│   └── shared/          # 💎 Shared value objects
├── 🏗️ infra/           # Infrastructure layer
│   ├── database/        # 🗄️ MongoDB connection and setup
│   ├── model/           # 🧠 AI model configuration
│   └── repositories/    # 📚 Data persistence layer
├── 🛠️ tools/           # Mastra tools for agent capabilities
└── 🔄 workflows/       # Business process workflows
```

## ✨ Features

### 🔄 Multi-Agent Evaluation Pipeline
1. **📚 Documentation Analysis** - Comprehensive review of README and project documentation
2. **🎯 Promise Extraction** - Systematic identification of project claims and features
3. **🧪 Automated Testing** - Verification of promises through code execution and testing
4. **⭐ Structured Scoring** - Evidence-based evaluation using defined rubrics
5. **🏷️ Tag Generation** - Automatic classification for searchability and organization

### 📊 Evaluation Criteria
- **📖 Documentation Quality** - Clarity, completeness, usability assessment
- **✅ Feature Completeness** - Delivery verification of promised functionality
- **🛡️ Reliability** - Error-free operation validation through testing
- **💡 Innovation/Impact** - Novelty and significance evaluation of solution
- **🏗️ Technical Implementation** - Code quality and architecture assessment

### 🎁 Template Contribution to Mastra Ecosystem
This project represents a **groundbreaking addition to Mastra's template library**, introducing enterprise-grade architectural patterns that are currently missing from the official collection:

#### 🏛️ **Domain-Driven Design (DDD) Pioneer**
- **🥇 First of Its Kind** - The only DDD implementation in Mastra's entire template library
- **📋 Complete Aggregate Implementation** - Showcases Project aggregates with proper encapsulation
- **💎 Value Objects Excellence** - ID value objects demonstrating immutability patterns
- **🔄 Use Case Architecture** - Clean application services following DDD principles
- **🗄️ Repository Pattern** - Proper data access abstraction maintaining domain boundaries
- **⚙️ Domain Configuration** - Centralized configuration management within domain context

#### 💉 **Dependency Injection Mastery** 
- **🚨 Critical Gap Filled** - Addresses the complete absence of DI examples in current templates
- **🔧 InversifyJS Integration** - Professional IoC container setup with decorators
- **🎭 Interface Segregation** - Clean abstractions between application layers
- **⚡ Lifecycle Management** - Singleton scoping and proper resource management
- **🧪 Testability Focus** - Architecture designed for easy mocking and unit testing
- **📦 Modular Design** - Loosely coupled components for maximum flexibility

#### 🏢 **Enterprise-Ready Architecture**
Unlike other templates focused on simple demos, this showcases:
- **🏗️ Production Patterns** - Battle-tested enterprise architectural decisions
- **📈 Scalability Design** - Built to handle complex business domains
- **🛡️ Maintainability** - Clean code principles and SOLID design patterns
- **🔍 Observability** - Comprehensive logging and monitoring integration

## 📋 Prerequisites

- 🟢 Node.js >= 20.9.0
- 🗄️ MongoDB instance for data persistence
- 🔑 OpenRouter API key for LLM access
- 📋 Project repository or documentation to evaluate

## 🚀 Installation

1. **📥 Clone the repository:**
```bash
git clone <repository-url>
cd mastra-template-evaluator
```

2. **📦 Install dependencies:**
```bash
npm install
```

3. **⚙️ Set up environment variables:**
```bash
# Configure OpenRouter API key and MongoDB connection
```

## 🎮 Usage

### 🔧 Development Mode
```bash
npm run dev
```

### 🏗️ Build
```bash
npm run build
```

### 🚀 Production
```bash
npm start
```

### 📊 Template Evaluation

The system can evaluate projects by:
- 📚 Analyzing markdown documentation and README files
- 🎥 Processing video demonstrations (YouTube links)
- 🎯 Extracting and verifying feature claims
- 🧪 Running automated tests and validations
- 📝 Generating comprehensive evaluation reports with scores and feedback

## 📦 Dependencies

### 🏗️ Core Framework
- `@mastra/core`: 🎯 Core Mastra framework functionality
- `@mastra/libsql`: 🗄️ SQLite storage for telemetry and evaluations
- `@mastra/memory`: 🧠 Memory management for agent persistence
- `@mastra/loggers`: 📊 Logging infrastructure

### 🤖 AI and LLM Integration
- `@openrouter/ai-sdk-provider`: 🔀 OpenRouter LLM provider
- `ai`: 🧠 AI SDK for language model interactions

### 🏛️ Infrastructure & Architecture
- `inversify`: 💉 Dependency injection container (IoC)
- `mongodb`: 🗄️ MongoDB database driver
- `zod`: ✅ Schema validation and type safety
- `reflect-metadata`: 🎭 Decorator metadata reflection

### 🛠️ Development
- `mastra`: 🔧 CLI tools for development and deployment
- `typescript`: 📝 TypeScript support and compilation
- `@types/node`: 🟢 Node.js type definitions

## 🚀 Multi-Agent Benefits

This architecture provides several advantages over single-agent approaches:

1. **🎯 Specialization** - Each agent focuses on a specific domain (documentation, testing, scoring)
2. **✨ Clarity** - Clear separation of concerns improves reliability and maintainability
3. **📈 Scalability** - Agents can run concurrently where appropriate
4. **🎯 Accuracy** - Writer-reviewer pattern in scoring agent ensures high-quality evaluations
5. **🔄 Flexibility** - Different models can be used for different complexity levels

## 🔄 Hackathon Evaluation Process

### 📋 **Submission Processing Pipeline**

1. **📥 Project Intake** 
   - Repository URL and documentation analysis
   - Demo video transcript extraction and processing
   - Environment setup and dependency detection

2. **⚡ Parallel Intelligence Gathering**
   - **Claims Extraction**: AI identifies all stated project capabilities
   - **Repository Analysis**: Code scanning for architectural patterns and sponsor integrations
   - **Video Analysis**: Demo functionality validation from transcript

3. **📋 Test Plan Generation**
   - **AI Test Designer**: Creates 3 targeted test plans per project
   - **Resource Allocation**: Assigns appropriate datasets, PDFs, and web resources
   - **Interaction Planning**: Designs realistic user scenarios for agent testing

4. **🧪 Live Functionality Testing**
   - **Automated Agent Interaction**: Tests each claimed feature through chat interfaces
   - **Success Validation**: Empirical verification against stated capabilities
   - **Evidence Collection**: Detailed logs and response analysis

5. **🏆 Multi-Dimensional Scoring**
   - **Technical Merit**: Architecture quality, code patterns, innovation
   - **Functional Completeness**: Validation of all claimed features
   - **Sponsor Alignment**: Automatic detection of prize track eligibility
   - **Impact Assessment**: Productivity gains, user value, market potential

6. **📊 Results Compilation**
   - **Detailed Scorecards**: Transparent breakdown of all evaluation criteria
   - **Prize Recommendations**: AI-identified sponsor track matches
   - **Improvement Feedback**: Specific suggestions for enhancement
   - **Comparative Ranking**: Position relative to other submissions

## 🚀 Value for Mastra.Build Hackathon

### 🎯 **Immediate Hackathon Impact**

#### 🏆 **Judges & Organizers**
- **⚡ 10x faster evaluation**: Process hundreds of submissions in hours, not days
- **🎯 Consistent scoring**: Every project evaluated using the same rigorous criteria
- **📊 Data-driven decisions**: Replace gut feelings with empirical evidence
- **🏷️ Automatic categorization**: AI identifies sponsor prize eligibility instantly
- **📈 Detailed rankings**: Transparent scoring breakdown for every submission

#### 🤖 **Participants**
- **📋 Clear expectations**: Understand exactly how projects will be evaluated
- **🔄 Immediate feedback**: Get detailed analysis of strengths and improvement areas  
- **🎯 Strategic insights**: See which sponsor tracks your project aligns with
- **⭐ Fair evaluation**: No bias based on presentation skills or demo timing
- **📚 Learning opportunity**: Understand enterprise-grade Mastra patterns

### 🏛️ **Long-term Mastra Ecosystem Value**

#### 🌟 **Template Library Leadership**
This template **pioneers critical architectural patterns** missing from Mastra's current library:

- **🏛️ Domain-Driven Design**: First and only DDD implementation in Mastra templates
- **💉 Dependency Injection**: Professional IoC container setup with InversifyJS
- **🏢 Enterprise Architecture**: Production-ready patterns for complex business logic
- **🧪 Systematic Testing**: Multi-agent evaluation workflows for quality assurance

#### 📚 **Educational Excellence**
- **📖 Reference Implementation**: Complete DDD + DI example for enterprise developers
- **🎯 Real Business Logic**: Project evaluation domain demonstrates complex workflows
- **🔧 Best Practices**: Proper error handling, logging, and monitoring integration
- **⚡ Scalability Patterns**: Built to handle hundreds of concurrent evaluations

#### 🚀 **Market Positioning**
- **🏢 Enterprise Credibility**: Positions Mastra as enterprise-capable framework
- **👥 Developer Attraction**: Sophisticated examples attract senior developers
- **📊 Quality Standards**: Establishes architectural benchmarks for future templates
- **🔮 Ecosystem Foundation**: Enables complex multi-agent applications in production

## 🙏 Acknowledgments

Thanks to [TranscriptAPI](https://transcriptapi.com/) for providing video transcription services with permission for this hackathon project.

## 📄 License

ISC