# AGENTS.md

Guidance for AI coding agents working in this project.

## Scope
- Project root: `devanswers-backend 2/`
- Stack: Node.js (ESM), Express 5, Mongoose, JWT auth, Vitest + MongoDB Memory Server.
- Purpose: DevAnswers — a Stack Overflow-style Q&A platform (questions, answers, tags, votes).

## Fast Start
- Install deps: `npm install`
- Run dev server: `npm run dev`
- Run tests: `npm test`
- Seed database: `npm run populate`

## Runtime Entry Flow
- Startup: `main.js` → `db.js` (MongoDB connection) → `server.js` (listener)
- Express wiring: `src/app.js`
- All routes mounted under `/api` prefix in `src/routes/index.js`:
  - `/api/auth` → `src/routes/auth.js`
  - `/api/tags` → `src/routes/tags.js`
  - `/api/questions` → `src/routes/questions.js`
  - `/api/answers` → `src/routes/answers.js`

## Code Organization
- `src/routes/*`: endpoint definitions and middleware composition
- `src/controllers/*`: request/response orchestration (thin — just call service, send response)
- `src/services/*`: all business logic and DB queries
- `src/models/*`: Mongoose schemas
- `src/middleware/authHandler.js`: JWT auth middleware
- `src/middleware/errorHandler.js`: global error handler (last middleware in app.js)
- `src/utils/createAppError.js`: shared error factory

## Conventions To Follow
- **Response shape** for all successful responses: `{ success: true, message, data }`.
- **Error handling**: throw `createAppError(message, statusCode)` from services; errors bubble to the global handler. Do not `res.send` errors in controllers.
- **Layer discipline**: DB/query logic stays in services, not controllers.
- **ESM imports**: use explicit `.js` extensions (e.g., `import foo from './foo.js'`).

## Auth Notes
- `authHandler.js` verifies `Authorization: Bearer <token>` and attaches `req.user = { id, isAdmin }` to the request (not a full Mongoose document).
- Use `req.user.id` (not `req.user._id`) when the auth middleware has been applied.

## Error Helper
- Import path: `src/utils/createAppError.js` (do **not** use `appError.js`).
- Usage: `throw createAppError('Not found', 404)`.

## Testing
- Framework: Vitest + Supertest + MongoDB Memory Server.
- Test files live in `tests/`. Run with `npm test` (executes `vitest run`).
- `fileParallelism: false` in `vitest.config.js` — tests run sequentially to avoid DB conflicts.
- `tests/setup.js` spins up an in-memory MongoDB instance; do not add separate DB connection logic in tests.
- After editing a service or controller, run `npm test` to catch regressions.

## Implementation Status
- **Complete**: Auth (register/login), Tags (list, questions-by-tag).
- **Stubs (to be implemented)**: `questionController.js`, `answerController.js`, `questionService.js`, `answerService.js`. These contain `// Your Code Here` placeholders.
- `voteService.js` is complete and can be used by answer/question services for up/downvote logic.

## Environment Variables
See `.env.example`:
```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/sampleDB
JWT_SECRET=please_change_this_to_a_secure_value
JWT_EXPIRATION=7d
```

## Known Pitfalls
- `req.user.id` (string) vs `req.user._id` (ObjectId) — authHandler sets `{ id, isAdmin }` so always use `req.user.id`.
- Tests are sequential (`fileParallelism: false`). Do not add parallel test runners.
- Express 5 is used — async errors are propagated automatically; no `try/catch` wrapping needed in controllers if using `next(err)` or simply `throw`.
