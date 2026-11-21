
import {
  getAccountBalances,
  type AccountBalance,
} from "@/modules/accounts/account-balance.service";

import { Types } from "mongoose";
import { TransactionModel } from "@/modules/transactions/transaction.model";

interface GetDashboardAccountsInput {
  workspaceId: string;
  userId: string;
}

export interface DashboardAccount extends AccountBalance {}

export interface DashboardMovementSummary {
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  transferFeesMinor: number;
  totalExpensesMinor: number;
  incomeCount: number;
  expenseCount: number;
  transferFeesCount: number;
}

export interface DashboardAccountsSummary {
  accountCount: number;
  accounts: DashboardAccount[];
  accountsByCurrency: {
    currency: string;
    accounts: DashboardAccount[];
  }[];
  movementsByCurrency: DashboardMovementSummary[];
}

function getCurrentMonthRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return {
    startDate: new Date(Date.UTC(year, month - 1, 1, 5)),
    endDate: new Date(Date.UTC(year, month, 1, 5)),
  };
}

export async function getDashboardAccounts({
  workspaceId,
  userId,
}: GetDashboardAccountsInput): Promise<DashboardAccountsSummary> {
  // 1. Obtener saldos de las cuentas
  const accounts = await getAccountBalances({ workspaceId, userId });

  // 2. Obtener el período del mes actual
  const { startDate, endDate } = getCurrentMonthRange();

  // 3. Obtener ingresos y gastos confirmados
  const movements = await TransactionModel.aggregate<{
    _id: {
      currency: string;
      type: "income" | "expense";
    };
    totalMinor: number;
    count: number;
  }>([
    {
      $match: {
        workspaceId: new Types.ObjectId(workspaceId),
        status: "confirmed",
        deletedAt: null,
        date: {
          $gte: startDate,
          $lt: endDate,
        },
        type: {
          $in: ["income", "expense"],
        },
      },
    },
    {
      $group: {
        _id: {
          currency: "$currency",
          type: "$type",
        },
        totalMinor: {
          $sum: "$amountMinor",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // 4. Obtener comisiones de transferencias confirmadas
  const fees = await TransactionModel.aggregate<{
    _id: string;
    totalMinor: number;
    count: number;
  }>([
    {
      $match: {
        workspaceId: new Types.ObjectId(workspaceId),
        status: "confirmed",
        deletedAt: null,
        type: "transfer",
        date: {
          $gte: startDate,
          $lt: endDate,
        },
        "fee.amountMinor": {
          $gt: 0,
        },
      },
    },
    {
      $group: {
        _id: "$fee.currency",
        totalMinor: {
          $sum: "$fee.amountMinor",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // 5. Crear resumen por moneda
  const summaryByCurrency = new Map<string, DashboardMovementSummary>();

  const getOrCreateSummary = (currency: string) => {
    let summary = summaryByCurrency.get(currency);

    if (!summary) {
      summary = {
        currency,
        incomeMinor: 0,
        expenseMinor: 0,
        transferFeesMinor: 0,
        totalExpensesMinor: 0,
        incomeCount: 0,
        expenseCount: 0,
        transferFeesCount: 0,
      };

      summaryByCurrency.set(currency, summary);
    }

    return summary;
  };

  // 6. Incorporar ingresos y gastos
  for (const movement of movements) {
    const summary = getOrCreateSummary(movement._id.currency);

    if (movement._id.type === "income") {
      summary.incomeMinor = movement.totalMinor;
      summary.incomeCount = movement.count;
    } else {
      summary.expenseMinor = movement.totalMinor;
      summary.expenseCount = movement.count;
    }
  }

  // 7. Incorporar comisiones
  for (const fee of fees) {
    const summary = getOrCreateSummary(fee._id);

    summary.transferFeesMinor = fee.totalMinor;
    summary.transferFeesCount = fee.count;
  }

  // 8. Calcular gastos totales y validar importes
  for (const summary of summaryByCurrency.values()) {
    summary.totalExpensesMinor =
      summary.expenseMinor + summary.transferFeesMinor;

    const amounts = [
      summary.incomeMinor,
      summary.expenseMinor,
      summary.transferFeesMinor,
      summary.totalExpensesMinor,
    ];

    if (!amounts.every(Number.isSafeInteger)) {
      throw new Error(
        `Dashboard amount exceeds safe integer range: ${summary.currency}`,
      );
    }
  }

  // 9. Agrupar cuentas por moneda
  const groupedAccounts = new Map<string, DashboardAccount[]>();

  for (const account of accounts) {
    const currencyAccounts = groupedAccounts.get(account.currency) ?? [];

    currencyAccounts.push(account);
    groupedAccounts.set(account.currency, currencyAccounts);
  }

  // 10. Retornar información del dashboard
  return {
    accountCount: accounts.length,
    accounts,
    accountsByCurrency: Array.from(
      groupedAccounts,
      ([currency, currencyAccounts]) => ({
        currency,
        accounts: currencyAccounts,
      }),
    ),
    movementsByCurrency: Array.from(summaryByCurrency.values()),
  };
}
