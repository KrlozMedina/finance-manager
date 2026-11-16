# Finance Manager

Personal and shared financial management application.

Finance Manager is a web application designed to help individuals and shared workspaces manage their finances, track income and expenses, organize financial accounts, and maintain accurate transaction records.

## Features

### Authentication and Workspaces
- Google authentication.
- Personal and shared workspaces.
- Workspace membership and role-based permissions.
- Workspace invitations and member management.

### Account Management
- Bank accounts.
- Savings accounts.
- Cash accounts.
- Digital wallets.
- Account visibility and archival.

### Category Management
- Custom income and expense categories.
- Subcategories.
- Category icons and colors.
- Workspace-scoped categories.

### Transaction Management
- Register income and expenses.
- Create pending transactions.
- Confirm pending transactions.
- Cancel pending transactions.
- Edit pending transactions.
- Support for category splits.
- Idempotent transaction creation.

### Financial Ledger
- Centralized financial transaction records.
- Automatic ledger entries for confirmed transactions.
- Positive and negative balance movements.
- Atomic database operations.
- Protection against duplicate ledger entries.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Backend:** Next.js API Routes
- **Database:** MongoDB Atlas
- **ODM:** Mongoose
- **Authentication:** Auth.js
- **Package Manager:** pnpm

## Project Status

Currently implemented:
- Authentication and workspace management.
- Financial account management.
- Category management.
- Income and expense transactions.
- Transaction confirmation, cancellation, and editing.
- Financial ledger and idempotency controls.

Planned:
- Transfers between accounts.
- Multi-currency transaction handling.
- Budgets and financial reports.
- Recurring transactions.
- Dashboard and financial analytics.

## Getting Started

### Requirements
- Node.js
- pnpm
- MongoDB Atlas account

### Installation

```bash
git clone https://github.com/KrlozMedina/finance-manager.git
cd finance-manager
pnpm install
```

### Environment Variables

Configure your environment variables in a `.env.local` file according to the application's authentication and database configuration.

### Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

## License

Not specified yet.
