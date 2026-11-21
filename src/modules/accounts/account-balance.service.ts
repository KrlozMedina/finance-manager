
import { Types } from "mongoose";

import { AccountModel } from "@/modules/accounts/account.model";
import { LedgerEntryModel } from "@/modules/transactions/ledger-entry.model";
import { connectDB } from "@/lib/mongodb/connection";

interface GetAccountBalancesInput {
  workspaceId: string;
  userId: string;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  type:
    | "bank"
    | "savings"
    | "cash"
    | "digital_wallet"
    | "credit_card"
    | "loan_liability"
    | "loan_receivable";
  currency: string;
  balanceMinor: number;

  // Información adicional para tarjetas de crédito.
  creditLimitMinor: number | null;
  usedCreditMinor: number | null;
  availableCreditMinor: number | null;
  creditUsagePercentage: number | null;
  overLimitMinor: number | null;
}

export async function getAccountBalances({
  workspaceId,
  userId,
}: GetAccountBalancesInput): Promise<AccountBalance[]> {
  if (
    !Types.ObjectId.isValid(workspaceId) ||
    !Types.ObjectId.isValid(userId)
  ) {
    throw new Error("Los identificadores proporcionados no son válidos.");
  }

  await connectDB();

  const workspaceObjectId = new Types.ObjectId(workspaceId);
  const userObjectId = new Types.ObjectId(userId);

  // Obtener las cuentas activas visibles para el usuario.
  const accounts = await AccountModel.find({
    workspaceId: workspaceObjectId,
    status: "active",
    $or: [
      { visibility: "shared" },
      { createdBy: userObjectId },
    ],
  })
    .select("_id name type currency details.creditLimitMinor")
    .lean();

  if (accounts.length === 0) {
    return [];
  }

  const accountIds = accounts.map((account) => account._id);

  // Calcular saldos desde el ledger.
  const balances = await LedgerEntryModel.aggregate<{
    _id: Types.ObjectId;
    balanceMinor: number;
    currencies: string[];
  }>([
    {
      $match: {
        workspaceId: workspaceObjectId,
        accountId: { $in: accountIds },
      },
    },
    {
      $group: {
        _id: "$accountId",
        balanceMinor: { $sum: "$amountMinor" },
        currencies: { $addToSet: "$currency" },
      },
    },
  ]);

  const balanceMap = new Map(
    balances.map((balance) => [
      balance._id.toString(),
      balance,
    ])
  );

  return accounts.map((account) => {
    const balance = balanceMap.get(account._id.toString());
    const balanceMinor = balance?.balanceMinor ?? 0;

    if (!Number.isSafeInteger(balanceMinor)) {
      throw new Error(
        `El saldo de la cuenta ${account.name} supera el límite de enteros seguros.`
      );
    }

    if (
      balance &&
      balance.currencies.some(
        (currency) => currency !== account.currency
      )
    ) {
      throw new Error(
        `Se detectaron monedas inconsistentes en la cuenta ${account.name}.`
      );
    }

    // Calcular información del cupo para tarjetas de crédito.
    let creditLimitMinor: number | null = null;
    let usedCreditMinor: number | null = null;
    let availableCreditMinor: number | null = null;
    let creditUsagePercentage: number | null = null;
    let overLimitMinor: number | null = null;

    if (account.type === "credit_card") {
      const limit = account.details?.creditLimitMinor ?? null;

      if (limit !== null) {
        if (!Number.isSafeInteger(limit) || limit <= 0) {
          throw new Error(
            `El límite de crédito de ${account.name} no es válido.`
          );
        }

        creditLimitMinor = limit;
        usedCreditMinor = Math.max(0, -balanceMinor);

        availableCreditMinor = limit - usedCreditMinor;

        creditUsagePercentage =
          (usedCreditMinor / limit) * 100;

        overLimitMinor = Math.max(
          0,
          usedCreditMinor - limit
        );
      }
    }

    return {
      accountId: account._id.toString(),
      accountName: account.name,
      type: account.type,
      currency: account.currency,
      balanceMinor,
      creditLimitMinor,
      usedCreditMinor,
      availableCreditMinor,
      creditUsagePercentage,
      overLimitMinor,
    };
  });
}
