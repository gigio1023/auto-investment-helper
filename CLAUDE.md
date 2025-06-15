# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Language Requirements
- **All documentation, commit messages, and pull requests MUST be written in English**
- **All code comments and technical documentation should be in English**
- **Maintain consistency with English-only technical communication**

## Development Commands

### Backend (NestJS API)
```bash
cd backend

# Development
npm run start:dev        # Hot-reload development server
npm run start:debug      # Debug mode with watch
npm run build           # Production build
npm run start:prod      # Run production build

# Testing
npm run test            # Unit tests
npm run test:watch      # Watch mode
npm run test:e2e        # End-to-end tests
npm run test:cov        # Coverage report
npm run test:all        # All tests (unit + e2e)

# Code Quality
npm run lint            # ESLint check and fix
npm run format          # Prettier formatting
```

### Frontend (React SPA)
```bash
cd frontend

# Development
npm start              # Development server (port 3000)
npm run dev           # Alias for npm start
npm run build         # Production build

# Testing
npm test              # Jest tests in watch mode
npm run test:coverage # Coverage report

# Code Quality
npm run lint          # ESLint check and fix
npm run format        # Prettier formatting
```

### Docker Deployment
```bash
# Full stack deployment
docker-compose up --build    # Build and start all services
docker-compose up -d         # Run in background
docker-compose down          # Stop services
docker-compose logs -f       # View logs
```

## Core Architecture

### Backend System (NestJS)
- **Reports Module**: Central orchestrator for investment report generation
- **News Module**: RSS feed collection and news aggregation from multiple sources
- **LLM Module**: AI-powered analysis using Gemini 2.5 Flash (primary) and GPT-4.1-nano (fallback)
- **Scheduler Service**: Automated cron jobs for report generation (8 AM, 6 PM KST)

### Frontend System (React 19)
- **Single Page Application** with React Router
- **Tailwind CSS** with glassmorphism effects
- **TypeScript** for type safety
- **Axios** for API communication

### Data Flow Architecture
1. **News Collection**: RSS feeds → NewsService → SQLite database
2. **Report Generation**: Scheduler triggers → ReportsService → NewsService (fetch) → LLMService (analyze) → Database storage
3. **Frontend Display**: API requests → Reports list/detail views → User interface

## Key Configuration Files

- **Environment Setup**: `backend/.env` (requires GEMINI_API_KEY)
- **Database**: SQLite at `backend/data/investment.db`
- **Scheduling**: Cron expressions in `backend/src/modules/reports/scheduler.service.ts`
- **News Sources**: RSS feeds configured in `backend/src/modules/news/news.service.ts`
- **AI Models**: Model selection and fallback logic in `backend/src/modules/llm/llm.service.ts`

## Investment Report Generation

### Automated Scheduling
- **Morning Reports**: Daily 8:00 AM KST (`0 8 * * *`)
- **Evening Reports**: Daily 6:00 PM KST (`0 18 * * *`)
- **Optional Midday**: 12:00 PM KST (env: `ENABLE_MIDDAY_REPORT=true`)
- **Weekly Outlook**: Sundays 7:00 PM KST (env: `ENABLE_WEEKLY_REPORT=true`)

### Manual Generation
- API endpoint: `POST /reports/generate/:type` (type: 'morning' | 'evening')
- Frontend trigger available in reports interface

### News Sources Integration
- **Korean**: 연합뉴스 경제, 매일경제
- **International**: BBC Business, Federal Reserve feeds
- **Processing**: RSS parsing → content cleaning → database storage → AI analysis

## API Endpoints

### Reports
- `GET /reports` - Paginated reports list
- `GET /reports/:id` - Specific report details
- `POST /reports/generate/:type` - Manual report generation

### News & System
- `GET /news/stats` - Collection statistics
- `POST /news/collect` - Manual news collection
- `GET /health` - Service health check

## Testing Strategy

### Backend Testing
- **Unit Tests**: `*.spec.ts` files alongside source code
- **E2E Tests**: `test/*.e2e-spec.ts` for full API workflows
- **Coverage**: Comprehensive coverage reports available

### Frontend Testing
- **Component Tests**: React Testing Library in `__tests__` directories
- **API Tests**: Service layer testing with mocked responses
- **Integration**: User interaction testing with Jest

## Development Patterns

### Error Handling
- **LLM Fallback**: Gemini failure → OpenAI fallback → Default analysis message
- **Rate Limiting**: Exponential backoff for API rate limits
- **News Collection**: Individual source failures don't break entire collection

### Data Management
- **TypeORM Entities**: `news-source.entity.ts`, `report.entity.ts`
- **TypeScript Types**: Shared interfaces in `frontend/src/types/`
- **Database Migrations**: Handled by TypeORM auto-sync in development

### Code Quality Standards
- **ESLint + Prettier** configured for both frontend and backend
- **TypeScript Strict Mode** enabled
- **Import Path Aliases**: `@/` for backend source root

## AI Integration Details

### Model Configuration
- **Primary**: Gemini 2.5 Flash Pro (cost-effective, fast)
- **Fallback**: GPT-4.1-nano (reliability backup)
- **Timeout**: 30 seconds per request
- **Temperature**: 0.7 for balanced creativity/consistency

### Investment Analysis Focus
- **Target Audience**: 27-year-old value investor
- **Investment Philosophy**: Long-term value investing, inflation hedge, portfolio diversification
- **Analysis Style**: Conservative, data-driven, practical recommendations

## Environment Variables

### Required
- `GEMINI_API_KEY` - Primary AI model access
- `OPENAI_API_KEY` - Fallback model (optional but recommended)

### Optional
- `ENABLE_MIDDAY_REPORT=true` - Additional daily report at noon
- `ENABLE_WEEKLY_REPORT=true` - Sunday evening market outlook
- `ENABLE_PERIODIC_NEWS_COLLECTION=true` - Every 2 hours news collection
- `NOTIFICATION_WEBHOOK_URL` - External notification system integration

## Development Guidelines

This project follows strict coding standards defined in `.cursor/rules/` for both NestJS backend and React frontend development.

### NestJS Backend Standards
- **Type Safety**: Always declare types, never use `any`, create proper interfaces
- **Code Structure**: Single responsibility per function/class, functions under 20 lines
- **Naming Conventions**: PascalCase for classes/interfaces, camelCase for variables/functions, kebab-case for files
- **Architecture**: Feature-based modules with controllers, services, entities, and models
- **Error Handling**: Use NestJS built-in exceptions with proper context
- **Testing**: AAA pattern (Arrange, Act, Assert) with descriptive test names

### React Frontend Standards
- **Components**: Always use functional components with explicit prop interfaces
- **TypeScript**: Enable strict mode, avoid `any`, use type inference where possible
- **State Management**: useState for local state, custom hooks for complex logic
- **File Organization**: PascalCase for components, camelCase for hooks/utils
- **Performance**: Use React.memo, useCallback, and code splitting when needed
- **Import Order**: React → External libraries → Internal absolute → Relative → Types

### Key Development Rules
1. **Never use `any` type** - Use `unknown` and type guards instead
2. **Keep functions small** - Maximum 20 lines for backend, 150 lines for components
3. **Use meaningful names** - Functions start with verbs, booleans with is/has/can
4. **Handle errors explicitly** - Add context and use proper exception types
5. **Write self-documenting code** - Clear names over comments
6. **Test all public methods** - Unit tests for services, component tests for UI
7. **Follow single responsibility** - One purpose per function/component
8. **Use dependency injection** - Proper NestJS DI patterns
9. **Implement proper validation** - DTOs for input, interfaces for output
10. **Maintain consistent code style** - ESLint and Prettier configurations