# BUILD_PLAN.md - Spreetail Assignment Documentation

This document summarizes the research, architectural choices, collaboration details, and tradeoffs made while engineering the Splitwise Clone application.

---

## 1. Product Research & Assumptions

### Research Discoveries
Through researching the core Splitwise product, we identified these fundamental workflows:
1. **Expenses vs. Payments:** Expenses represent money spent on items (split among group members), whereas payments/settlements represent cash transfers from one member to another to cancel out debts. Both influence individual balances but represent different database schemas.
2. **Pairs vs. Group Optimization:** Group balances are calculated by accumulating all expenses and settlements. While individual "Direct" debts track who owes whom based on specific expense participations, "Simplified" debts minimize transactions across the whole group graph.
3. **Real-time Collaboration:** Real-time expense comments/chats are a core component to discuss and verify bills.

### Crucial Assumptions Made
- **Relational Integrity:** SQLite was selected for development since it is fully relational, supporting cascading deletes, transactions, and foreign keys out of the box, without requiring a running Docker daemon.
- **Rounding Handling:** When dividing bills equally (e.g. $10.00 among 3 people), the remainder cent is given to the final member of the split list.
- **Group-Scoped Balances:** Balances and simplified debt path graphs are calculated inside individual groups. The Home Dashboard aggregates the active user's total net balance across all groups.

---

## 2. Architecture & Design

### Relational Database Schema
- **User:** Holds credentials (hashed via bcryptjs) and profile details.
- **Group & GroupMember:** Represents the many-to-many relationship of users in expense groups.
- **Expense & ExpenseSplit:** Tracks details of bills and the individual breakdown of amounts, percentages, and shares.
- **ChatMessage:** Stores real-time chat histories for each expense.
- **Settlement:** Records payments made between members.

### API Architecture
REST API built with Express in JavaScript ES Modules exposing endpoints for `/api/auth`, `/api/groups`, `/api/expenses`, and `/api/settlements` (protected by JWT verification middleware). Calculations for net balances and graph debt optimization are performed dynamically at fetch time, ensuring they are always up-to-date and consistent.

### Frontend Structure
Built as a single-page React app with Vite in pure JavaScript/JSX to resolve compilation errors.
- `/context/AuthContext.jsx` manages sessions and defaults Axios headers.
- `/components/Dashboard.jsx` forms the dashboard interface layout.
- `/components/ExpenseModal.jsx` handles Equal, Unequal, Percentage, and Share input forms.
- `/components/SettleModal.jsx` records payments.
- `/components/ChatPane.jsx` handles Socket.io WebSockets connections.
- `/index.css` applies styling variables, transitions, animations, and glassmorphic card parameters.

---

## 3. AI Collaboration Process

- **Role Assignment:** The AI acted as a full developer/junior engineer pairing with the lead developer (the user).
- **Core Strategy:** The implementation plan was drafted first and approved by the user. SQLite was substituted for PostgreSQL in the local development stage due to local Docker API limitations, guaranteeing instant reproducibility.
- **Language Strategy:** To ensure a frictionless build, both the React frontend and Node backend files were converted from TypeScript into clean, standard JavaScript ES Modules (`.jsx` and `.js` respectively) at the user's request.
- **Context Preservation:** `AI_CONTEXT.md` was created to serve as the absolute source of truth, describing all endpoints, models, and protocols.

---

## 4. Tradeoffs & Potential Improvements

### Tradeoffs Made (Simplifications)
- ** wildcards in CORS:** Wildcats are used for development, which is insecure for production. Scoping to client domain would be done in production.
- **Session Lifespans:** Token session length is hardcoded to 7 days.
- **Self-contained Server:** Express handles both REST API calls and the WebSocket Server. For large production loads, WebSocket handling should be decoupled to prevent event loop blockages.

### Future Enhancements (With More Time)
1. **Multi-Currency Support:** Support conversions using exchange APIs.
2. **Push Notifications:** Alert users in real-time if an expense is added, edited, or if they are mentioned in a chat.
3. **Expense Attachments:** Upload image receipts using cloud storage buckets.
4. **OAuth Sign-in:** Google/Apple login integrations.
