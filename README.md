# Finance Manager

Personal and shared financial management application.

Finance Manager is a web application designed to help individuals and shared workspaces manage their finances, track income and expenses, organize financial accounts, and maintain accurate transaction records through a centralized financial ledger.

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
- Credit cards.
- Loan and receivable accounts.
- Multiple currencies.
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
- Ledger integrity controls.
- Soft-deleted transactions excluded from regular listings without modifying historical ledger records.

### Dashboard and Financial Overview
- Account balance summaries.
- Account grouping by currency.
- Credit card utilization and available credit.
- Monthly income and expense summaries.
- Monthly transfer fee tracking.
- Monthly financial balance by currency.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript.
- **Backend:** Next.js API Routes.
- **Database:** MongoDB Atlas.
- **ODM:** Mongoose.
- **Authentication:** Auth.js.
- **Styling:** SCSS Modules.
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
- Dashboard and financial summaries.

### Planned
- Complete transaction history interface.
- Advanced transaction search and filtering interface.
- Multi-currency transaction conversion and exchange rates.
- Budgets and financial reports.
- Recurring transactions.
- Advanced financial insights.

## Getting Started

### Requirements
- Node.js.
- pnpm.
- MongoDB Atlas account.
- Google Cloud project with OAuth credentials.

### Installation

```bash
git clone https://github.com/KrlozMedina/finance-manager.git
cd finance-manager
pnpm install
```

### Environment Variables

Create a `.env.local` file in the project root and configure the environment variables required by the application.

These include:
- MongoDB connection configuration.
- Auth.js authentication configuration.
- Google OAuth credentials.
- Authentication secrets.

Use the variable names expected by the application's configuration. Never commit `.env.local` or expose credentials in the repository.

### Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

### Build for Production

```bash
pnpm build
pnpm start
```

## License

No license has been specified yet.