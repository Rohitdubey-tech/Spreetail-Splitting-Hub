# Architectural & Design Decisions

This document details the architectural choices, design paradigms, and trade-offs made during the development of the Spreetail Splitting Hub application.

---

## 1. Technical Stack Decisions

### A. SQLite & Prisma ORM
* **Decision**: Use SQLite for local database storage combined with Prisma ORM.
* **Rationale**:
  - SQLite requires zero local installation or external Docker containers, minimizing setup complexity for reviewers.
  - Prisma provides type-safe queries, auto-generated migration histories, and simple schema adjustment syntax.
  - Database access is highly performant for flatmate-sized ledger groups.

### B. JavaScript/ES Modules over TypeScript
* **Decision**: Build the application using modern JavaScript (ES Modules in the backend, JSX/JS in the frontend).
* **Rationale**:
  - Eliminates type-compilation overhead and bundler mismatches on fast server builds.
  - Standardizes the environment to raw Node.js and React/Vite without intermediate `.ts` compilation layers.

### C. Express & Socket.io Backend
* **Decision**: Express.js for REST API endpoints and Socket.io for websocket connections.
* **Rationale**:
  - Express is standard and lightweight for building API handlers like `/api/groups/import-csv`.
  - Socket.io is used to implement a real-time chat workspace inside each bill's discussion panel, allowing flatmates to resolve ledger questions instantly.

---

## 2. Ingestion Design Decisions

### A. Copy-Paste Textarea vs. Multi-part File Upload
* **Decision**: Provide a clean text input area for raw CSV content alongside a "Load Demo CSV Data" shortcut instead of a file input field.
* **Rationale**:
  - Eliminates multi-part form data parser dependencies (like `multer`), making serverless or server hosting more resilient and secure.
  - Allows the user to inspect, modify, or correct spelling typos in the CSV content directly in the browser before invoking the backend ingestion script.

### B. String Scanning CSV Parser
* **Decision**: Write a custom inline CSV line scanner rather than importing `papaparse` or `csv-parser`.
* **Rationale**:
  - Keeps the backend dependency footprint small.
  - Handled the crucial edge case where cells containing commas were enclosed in double quotes (e.g. `"1,200"` or `"Aisha;Rohan;Priya;Meera"` splits) without breaking row tokenization.

### C. Name Normalization & Typo Matching
* **Decision**: Normalize case and handle known name variants dynamically (e.g. mapping `Priya S` to `Priya`, `priya` to `Priya`, and trimming excess whitespace).
* **Rationale**:
  - Prevents the database from generating redundant user records for the same physical person due to minor spacing or casing differences in the spreadsheet.

---

## 3. UI/UX & Design Decisions

### A. Warm Terracotta & Sandstone Editorial Theme
* **Decision**: Choose an organic dark theme based on Terracotta, Charcoal, and Sandstone accents (`hsl(28, 55%, 55%)` and `hsl(20, 10%, 8%)`).
* **Rationale**:
  - Stands out completely from standard Bootstrap or generic Tailwind templates.
  - Editorial font pairings (**Fraunces** serif and **Plus Jakarta Sans** sans-serif) elevate the app to feel premium, human, and highly custom.

### B. Inline Anomaly Audit Dashboard
* **Decision**: Provide a visual, structured review table of CSV anomalies showing Row Number, Type (Critical/Warning/Info), Field, Description, and Resolution Action (e.g. ROUNDED, SKIPPED, DEFAULTED).
* **Rationale**:
  - Gives the user instant validation on why certain rows were skipped or how amounts were converted, rather than leaving them in the dark about missing records.
