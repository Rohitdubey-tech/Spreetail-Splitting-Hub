# AI Usage & Collaboration Report

This document highlights the collaborative workflow between the developer and the AI Assistant (Antigravity) to build, debug, and optimize the Spreetail Splitting Hub.

---

## 1. System Prompts & Collaboration Scope
* **Tool Used**: Antigravity (Advanced Agentic Coding assistant developed by DeepMind).
* **Primary Scope**: Design styling overhaul, backend CSV parsing endpoint creation, data mapping, real-time balance engine checks, and automated server build configuration debugging.

---

## 2. Debugging & Optimization Case Studies

### Case 1: TypeScript to JavaScript Clean Up
* **Issue**: The initial boilerplate configuration mixed TypeScript files (`.ts` / `tsconfig.json`) with standard ES Modules, resulting in bundling conflicts and module type resolution exceptions during local Vite development.
* **Prompt context**: "why there is ts?" / "Analyze the whole project again if u feel any problem in that just update it. As of now it is working properly"
* **Solution**:
  - Removed obsolete TypeScript configuration files (`tsconfig.json`, `tsconfig.node.json`, `vite-env.d.ts`).
  - Standardized file extensions to pure JSX (`.jsx`) and JS (`.js`).
  - Swapped out typescript compiler packages in favor of standard ES dev dependencies, simplifying the build chain.

### Case 2: Render Server Startup Crash (Prisma & Database)
* **Issue**: When deploying the Express backend to Render, the build crashed because:
  1. The Prisma Client binary was missing in the production bundle.
  2. Database migrations had not run, leaving the SQLite database tables uninitialized.
* **Prompt context**: "i deployed backend on render and frontend on vercel"
* **Solution**:
  - Refactored the `start` script in backend [package.json](file:///Users/rohitkumardubey/Desktop/spreetail/backend/package.json#L8) to run:
    ```bash
    npx prisma generate && npx prisma migrate deploy && node src/index.js
    ```
  - This ensures the Prisma engine client is generated fresh inside the cloud runner and the database tables are migrated and verified before the HTTP server starts listening for connections.

### Case 3: Avatar Image Sizing & Distortion
* **Issue**: The group switcher and transaction table showed distorted, oversized initials avatars due to missing CSS classes.
* **Prompt context**: "analyze properly ui is good but there is no login logout option is coming directly interface is opening and the name icons are looking weired"
* **Solution**:
  - Defined the `.avatar-sm` and `.avatar-md` CSS constraints inside [index.css](file:///Users/rohitkumardubey/Desktop/spreetail/frontend/src/index.css) to set proper aspect ratios and dimensions (e.g. 32px/40px with `border-radius: 50%`).
  - Added a responsive "Sign Out" button to the header and polished visual placement.
