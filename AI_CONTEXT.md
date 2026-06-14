# AI_CONTEXT.md - Project Single Source of Truth

This document serves as the absolute blueprint and single source of truth for the Spreetail Splitwise Clone. It contains the architecture, data schemas, API designs, and implementation decisions that were agreed upon and built.

---

## 1. Product Understanding & Scope

### Minimum Product Requirements
1. **User Authentication & Search:** Standard user signup and login. Searchable directory of users to invite to groups.
2. **Group Management:** Creation of groups, adding/inviting members, and removing members.
   - *Edge Case Rule:* Users cannot be removed from a group if they have any active, non-zero balance.
3. **Expense Tracking & Splitting:**
   - Multi-mode split engine supporting:
     - **EQUAL:** Cost divided equally among selected users. Rounding errors are corrected by giving the remaining penny to the payer.
     - **UNEQUAL:** Cost divided by arbitrary, specific cash inputs. Enforces that split values sum to the total expense amount.
     - **PERCENTAGE:** Cost divided by percentage inputs. Enforces that percentages sum to exactly 100%.
     - **SHARE:** Cost divided by relative weight inputs (e.g. 2 shares, 1 share).
   - Ability to edit and delete expenses, which automatically recalculates balances.
4. **Group Balances & Debt Minimization:**
   - Visual summary of pairwise balances (who owes whom what).
   - Toggable greedy Debt Simplification algorithm that minimizes transactions.
5. **Real-time Expense Chat:**
   - Group discussion forum inside individual expenses, updated in real-time.
6. **Settlement Module:**
   - Recording direct payments to settle outstanding debts, reducing balances immediately. Revert settlements at any time.

---

## 2. Tech Stack Decisions

- **Frontend:** React (Vite, JavaScript/JSX) styled with custom **Vanilla CSS** incorporating responsive layouts, dark mode parameters, glassmorphic visual tokens, and smooth UI transition animations.
- **Backend:** Node.js (Express in JavaScript ES Modules) with **Prisma ORM** for schema modeling.
- **Database:** SQLite relational engine (chosen for local portable setup without Docker daemon dependencies) with transition configuration for production PostgreSQL.
- **Real-Time:** WebSockets using **Socket.io** (Node.js engine and React client integration).

---

## 3. Database Schema

```prisma
model User {
  id           String        @id @default(uuid())
  email        String        @unique
  passwordHash String
  name         String
  avatarUrl    String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  memberships  GroupMember[]
  paidExpenses Expense[]     @relation("PaidExpenses")
  splits       ExpenseSplit[]
  chatMessages ChatMessage[]
  sentPayments Settlement[]   @relation("SentPayments")
  receivedPayments Settlement[] @relation("ReceivedPayments")
}

model Group {
  id          String        @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  members     GroupMember[]
  expenses    Expense[]
  settlements Settlement[]
}

model GroupMember {
  id       String   @id @default(uuid())
  groupId  String
  userId   String
  joinedAt DateTime @default(now())
  group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
}

model Expense {
  id          String         @id @default(uuid())
  groupId     String
  title       String
  totalAmount Float
  paidById    String
  splitType   String         // "EQUAL", "UNEQUAL", "PERCENTAGE", "SHARE"
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  group       Group          @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidBy      User           @relation("PaidExpenses", fields: [paidById], references: [id])
  splits      ExpenseSplit[]
  chatMessages ChatMessage[]
}

model ExpenseSplit {
  id         String   @id @default(uuid())
  expenseId  String
  userId     String
  amount     Float
  percentage Float?
  shares     Float?
  expense    Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([expenseId, userId])
}

model ChatMessage {
  id        String   @id @default(uuid())
  expenseId String
  userId    String
  message   String
  createdAt DateTime @default(now())
  expense   Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Settlement {
  id         String   @id @default(uuid())
  groupId    String
  payerId    String
  receiverId String
  amount     Float
  createdAt  DateTime @default(now())
  group      Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  payer      User     @relation("SentPayments", fields: [payerId], references: [id])
  receiver   User     @relation("ReceivedPayments", fields: [receiverId], references: [id])
}
```

---

## 4. REST API Design

### Authentication (`/api/auth`)
* `POST /register`: Registers new user and issues JWT token.
* `POST /login`: Validates password credentials and returns JWT token.
* `GET /me`: Fetches authenticated user info.
* `GET /users`: Lists all users for group selection dropdowns.

### Groups (`/api/groups`)
* `GET /`: Lists all groups the active user belongs to.
* `POST /`: Creates a group, seeding creator and initial users.
* `GET /:id`: Retrieves group details, calculations, and balances (direct and simplified).
* `POST /:id/members`: Adds users to group.
* `DELETE /:id/members/:userId`: Removes user from group (requires outstanding balance check).

### Expenses (`/api/expenses`)
* `POST /`: Records a new expense, verifying splitting rules and creating splits records.
* `PUT /:id`: Modifies an expense, deleting previous split maps and writing new split configurations.
* `DELETE /:id`: Deletes an expense.
* `GET /:id/messages`: Retrieves historical chat logs for the expense room.

### Settlements (`/api/settlements`)
* `POST /`: Records a payment between two group members.
* `DELETE /:id`: Reverts a recorded settlement.

---

## 5. WebSockets Real-time Protocol

The application uses standard namespaces:
* **Connection Event:** `io.on('connection')` triggered when client launches.
* **Join Room:** `socket.emit('join_expense', { expenseId })` places user in socket room for real-time isolation.
* **Leave Room:** `socket.emit('leave_expense', { expenseId })` removes user from target group.
* **New Message Dispatch:** `socket.emit('send_message', { expenseId, userId, message })` writes chat to DB, then emits `receive_message` to all clients listening in the expense room.

---

## 6. Known Tradeoffs & Limitations

- **Rounding Correction:** Rounding adjustments are distributed to the final participant in `EQUAL` splits, which is standard and mathematically clean, but does not rotate who gets the rounded penny.
- **Relational Choice:** SQLite was selected for local dev. The code uses Prisma, making it 100% database-agnostic. For production, simply change `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma`.
- **CORS Handling:** Backend has CORS configured to accept wildcard `*` for easy localhost development. In production, this should be scoped to the deployed domain.
