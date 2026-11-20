# Finance Manager

Personal and shared financial management application.

Finance Manager is a web application designed to help individuals and shared workspaces manage their finances, track income and expenses, organize financial accounts, and maintain accurate transaction records.

## Features

### Authentication and Workspaces
- Google authentication with Auth.js.
- Personal and shared workspaces.
- Workspace membership and role-based permissions.
- Workspace invitations and member management.
- Active workspace selection.
- Workspace ownership management and access control.

### Account Management
- Bank accounts.
- Savings accounts.
- Cash accounts.
- Digital wallets.
- Initial account balances.
- Account visibility and archival.
- Workspace-scoped account management.

### Category Management
- Custom income and expense categories.
- Subcategories.
- Category icons and colors.
- Workspace-scoped categories.
- Category hierarchy management.

### Transaction Management
- Register income and expenses.
- Register account transfers.
- Create pending transactions.
- Confirm pending transactions.
- Cancel pending transactions.
- Edit pending transactions.
- Soft delete pending transactions.
- Support for category splits.
- Transaction filtering and pagination.
- Idempotent transaction creation.
- Role-based transaction permissions.

### Financial Ledger
- Centralized financial transaction records.
- Automatic ledger entries for confirmed transactions.
- Positive and negative balance movements.
- Initial balance tracking.
- Atomic database operations.
- Protection against duplicate ledger entries.
- Ledger integrity when transactions are edited, confirmed, or cancelled.
- Soft-deleted transactions excluded from regular listings without modifying historical ledger records.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript.
- **Backend:** Next.js API Routes.
- **Database:** MongoDB Atlas.
- **ODM:** Mongoose.
- **Authentication:** Auth.js.
- **Package Manager:** pnpm.

## Project Status

### Implemented
- Authentication and workspace management.
- Workspace membership and role-based permissions.
- Financial account management.
- Category management.
- Income and expense transactions.
- Account transfers.
- Transaction confirmation, cancellation, and editing.
- Soft deletion of pending transactions.
- Financial ledger and idempotency controls.
- Transaction access control and workspace isolation.

### Planned
- Multi-currency transaction handling and exchange rates.
- Budgets and financial reports.
- Recurring transactions.
- Dashboard and financial analytics.
- Advanced financial insights.

## Getting Started

### Requirements
- Node.js.
- pnpm.
- MongoDB Atlas account.

### Installation

```bash
git clone https://github.com/KrlozMedina/finance-manager.git
cd finance-manager
pnpm install
```

### Environment Variables

Create a `.env.local` file in the project root and configure the environment variables required by the application.

These include the database connection and authentication configuration. Refer to the application's configuration for the exact variable names.

### Run Development Server

```bash
pnpm dev
```

Open http://localhost:3000 to access the application.

## License

Not specified yet.
