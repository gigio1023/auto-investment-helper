# Auto Investment Helper

AI-powered investment analysis and report generation service for value investors.

## System Architecture

```mermaid
graph TD
    subgraph "User Interface"
        USER[React SPA]
    end

    subgraph "Backend System"
        API[NestJS API]
        
        subgraph "Core Modules"
            REPORTS[Reports Module]
            NEWS[News Module]
            LLM[LLM Module]
        end

        SCHED[Task Scheduler]
        DB[(SQLite DB)]
    end

    subgraph "External Services"
        RSS[RSS News Feeds]
        AI_API["AI Providers<br/>(Gemini, GPT-4.1-nano)"]
    end

    USER -->|REST API| API
    API --> REPORTS
    API --> NEWS
    
    REPORTS --> LLM
    REPORTS --> DB
    
    NEWS --> DB
    NEWS -->|Cron Job| RSS
    
    LLM --> AI_API
    
    SCHED -->|Triggers| REPORTS
```

## Report Generation Flow

Automated investment reports are generated twice daily (8 AM, 6 PM KST) or on-demand.

```mermaid
sequenceDiagram
    participant SCH as Scheduler
    participant USR as User
    participant API as NestJS API
    participant REP as ReportsService
    participant NEW as NewsService
    participant LLM as LLMService
    participant DB as Database
    participant RSS as RSS Feeds
    participant AI as AI Provider

    alt Scheduled Report
        SCH->>API: POST /reports/generate
    else Manual Report
        USR->>API: POST /reports/generate
    end

    API->>REP: triggerReportGeneration()
    REP->>NEW: collectNews()
    NEW->>RSS: Fetch news articles
    RSS-->>NEW: Return articles
    NEW->>DB: Store news
    
    REP->>DB: Get all news for report
    DB-->>REP: Return news
    
    REP->>LLM: analyzeAndSummarize(news)
    LLM->>AI: Summarize and analyze content
    AI-->>LLM: Return analysis
    
    LLM-->>REP: Return final report content
    REP->>DB: Save generated report
```

## News Collection Process

```mermaid
flowchart TD
    A[Start Collection] --> B{For each news source}
    B -->|Yes| C[Fetch RSS Feed]
    B -->|No| H[End Collection]
    C --> D{Parse XML}
    D -->|Success| E[Extract articles]
    D -->|Error| G[Log error]
    E --> F[Store in Database]
    F --> B
    G --> B
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend  | React 19, TypeScript, Tailwind CSS |
| Backend   | NestJS, TypeScript, TypeORM |
| Database  | SQLite |
| AI        | Gemini 2.5 Flash (primary), GPT-4.1-nano (fallback) |

## Quick Start

### For Development

```bash
# Clone the repository
git clone <repository-url>
cd auto-investment-helper

# Setup backend
cd backend
npm install
cp .env.example .env
# Add your GEMINI_API_KEY to .env
npm run start:dev

# In another terminal, setup frontend
cd frontend
npm install
npm start
```

### For Production (Docker)

```bash
# Clone and setup environment
git clone <repository-url>
cd auto-investment-helper
cp backend/.env.example backend/.env
# Add your GEMINI_API_KEY to backend/.env

# Build and run with Docker Compose
docker-compose up --build
```

**Endpoints:**
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:3000`

## Development

Each service runs independently. Navigate to the service directory and use standard npm commands.

### Backend Development
```bash
cd backend

# Install dependencies
npm install

# Development with hot-reload
npm run start:dev

# Build for production
npm run build

# Run tests
npm run test:all

# Lint and format
npm run lint
npm run format
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Development server
npm start

# Build for production
npm run build

# Run tests
npm run test:coverage

# Lint and format
npm run lint
npm run format
```

## Production Deployment

Use Docker Compose for production deployment:

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

  ## API Reference

- `GET /reports` - List reports (paginated)
- `GET /reports/:id` - Get specific report  
- `POST /reports/generate/:type` - Generate report (`morning`/`evening`)
- `GET /news/stats` - News collection statistics
- `POST /news/collect` - Manual news collection
- `GET /health` - Service health check

## Configuration

Key service files for customization:

- **News Sources**: `backend/src/modules/news/news.service.ts`
- **AI Models**: `backend/src/modules/llm/llm.service.ts`  
- **Scheduling**: `backend/src/modules/reports/scheduler.service.ts`

## Documentation

- [API Reference](./docs/api-reference.md)
- [Development Guide](./docs/development-guide.md)
- [Deployment Guide](./docs/deployment-guide.md)

## License

ISC

## Notes

- Gemini API key required
- Check database paths and security settings for production
- Monitor API usage costs
- This project leverages AI development tools (Claude Code, Cursor) for enhanced development workflow and code quality