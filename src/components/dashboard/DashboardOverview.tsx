
"use client";

import { useEffect, useState } from "react";

import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { formatCurrency } from "@/lib/currency/currency";

import styles from "./DashboardOverview.module.scss";

interface DashboardAccount {
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
  creditLimitMinor: number | null;
  usedCreditMinor: number | null;
  availableCreditMinor: number | null;
  creditUsagePercentage: number | null;
  overLimitMinor: number | null;
}

interface DashboardMovementSummary {
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  transferFeesMinor: number;
  totalExpensesMinor: number;
  incomeCount: number;
  expenseCount: number;
  transferFeesCount: number;
}

interface DashboardSummary {
  accountCount: number;
  accounts: DashboardAccount[];
  accountsByCurrency: {
    currency: string;
    accounts: DashboardAccount[];
  }[];
  movementsByCurrency: DashboardMovementSummary[];
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

function getAccountTypeLabel(type: DashboardAccount["type"]): string {
  const labels: Record<DashboardAccount["type"], string> = {
    bank: "Cuenta bancaria",
    savings: "Cuenta de ahorros",
    cash: "Efectivo",
    digital_wallet: "Billetera digital",
    credit_card: "Tarjeta de crédito",
    loan_liability: "Préstamo por pagar",
    loan_receivable: "Préstamo por cobrar",
  };

  return labels[type];
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function DashboardOverview() {
  const { activeWorkspace, isLoading: workspaceLoading } =
    useWorkspace();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceLoading) return;

    if (!activeWorkspace) {
      setSummary(null);
      setError("No hay un workspace activo.");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadSummary() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/v1/dashboard/summary", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        const result: ApiResponse<DashboardSummary> =
          await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message ?? "No fue posible cargar el dashboard."
          );
        }

        setSummary(result.data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Error al cargar el dashboard."
        );

        setSummary(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => controller.abort();
  }, [activeWorkspace?.id, workspaceLoading]);

  if (workspaceLoading || isLoading) {
    return (
      <section className={styles.state}>
        <span className={styles.loader} />
        <p>Cargando información financiera...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.state}>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!summary) return null;

  const monthlyMovements = summary.movementsByCurrency ?? [];

  const monthlyBalanceByCurrency = monthlyMovements.map((movement) => ({
    ...movement,
    balanceMinor:
      movement.incomeMinor - movement.totalExpensesMinor,
  }));

  const creditCardsByCurrency = summary.accountsByCurrency
  .map(({ currency, accounts }) => {
    const cards = accounts.filter(
      (account) => account.type === "credit_card"
    );

    if (cards.length === 0) return null;

    const configuredCards = cards.filter(
      (card) => card.creditLimitMinor !== null
    );

    const totalLimitMinor = configuredCards.reduce(
      (total, card) => total + (card.creditLimitMinor ?? 0),
      0
    );

    // La deuda se obtiene del saldo del Ledger.
    const totalDebtMinor = cards.reduce(
      (total, card) => total + Math.max(0, -card.balanceMinor),
      0
    );

    // Solo se suman tarjetas cuyo cupo está configurado.
    const availableCreditMinor = configuredCards.reduce(
      (total, card) => total + (card.availableCreditMinor ?? 0),
      0
    );

    return {
      currency,
      totalCards: cards.length,
      configuredCards: configuredCards.length,
      totalLimitMinor,
      totalDebtMinor,
      availableCreditMinor,
    };
  })
  .filter((group) => group !== null);

  return (
    <section className={styles.dashboard}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>RESUMEN GENERAL</span>
          <h2>Resumen financiero</h2>
          <p>Consulta el estado actual de tus cuentas.</p>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <span className={styles.cardLabel}>Cuentas activas</span>
          <strong className={styles.cardValue}>
            {summary.accountCount}
          </strong>
          <span className={styles.cardDescription}>
            Cuentas disponibles en este workspace
          </span>
        </article>

        {summary.accountsByCurrency.map((group) => (
          <article
            className={styles.summaryCard}
            key={group.currency}
          >
            <span className={styles.cardLabel}>
              Cuentas en {group.currency}
            </span>

            <strong className={styles.cardValue}>
              {group.accounts.length}
            </strong>

            <span className={styles.cardDescription}>
              Consulta los saldos individuales abajo
            </span>
          </article>
        ))}
      </div>

      <div className={styles.movementsSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Resumen del mes</h3>
            <p>Ingresos y gastos del mes calendario actual.</p>
          </div>
        </div>

        {monthlyBalanceByCurrency.length === 0 ? (
          <div className={styles.empty}>
            <p>Aún no hay movimientos confirmados este mes.</p>
          </div>
        ) : (
          <div className={styles.movementsGrid}>
            {monthlyBalanceByCurrency.map((movement) => (
              <article
                className={styles.movementCard}
                key={movement.currency}
              >
                <span className={styles.cardLabel}>
                  Balance del mes · {movement.currency}
                </span>

                <strong
                  className={`${styles.movementBalance} ${
                    movement.balanceMinor >= 0
                      ? styles.movementPositive
                      : styles.movementNegative
                  }`}
                >
                  {formatCurrency(
                    movement.balanceMinor,
                    movement.currency
                  )}
                </strong>

                <div>
                  <span>Ingresos</span>
                  <strong>
                    {formatCurrency(
                      movement.incomeMinor,
                      movement.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>Gastos</span>
                  <strong>
                    {formatCurrency(
                      movement.expenseMinor,
                      movement.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>Comisiones</span>
                  <strong>
                    {formatCurrency(
                      movement.transferFeesMinor,
                      movement.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>Total de gastos</span>
                  <strong>
                    {formatCurrency(
                      movement.totalExpensesMinor,
                      movement.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>Movimientos</span>
                  <strong>
                    {movement.incomeCount + movement.expenseCount}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      
      <div className={styles.creditSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Tarjetas de crédito</h3>
            <p>Resumen de deuda y cupos disponibles.</p>
          </div>
        </div>

        {creditCardsByCurrency.length === 0 ? (
          <div className={styles.empty}>
            <p>No tienes tarjetas de crédito registradas.</p>
          </div>
        ) : (
          <div className={styles.creditGroups}>
            {creditCardsByCurrency.map((group) => (
              <article
                className={styles.creditSummaryCard}
                key={group.currency}
              >
                <h4>{group.currency}</h4>

                <div className={styles.creditSummaryGrid}>
                  <div>
                    <span>Tarjetas registradas</span>
                    <strong>{group.totalCards}</strong>
                  </div>

                  <div>
                    <span>Cupo aprobado</span>
                    <strong>
                      {formatCurrency(
                        group.totalLimitMinor,
                        group.currency
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Deuda total</span>
                    <strong>
                      {formatCurrency(
                        group.totalDebtMinor,
                        group.currency
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Cupo disponible</span>
                    <strong>
                      {formatCurrency(
                        group.availableCreditMinor,
                        group.currency
                      )}
                    </strong>
                  </div>
                </div>

                {group.configuredCards !== group.totalCards && (
                  <p className={styles.creditNotice}>
                    El cupo disponible solo contempla{" "}
                    {group.configuredCards} de {group.totalCards} tarjetas,
                    porque algunas no tienen cupo configurado.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={styles.accountsSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Mis cuentas</h3>
            <p>Saldo actual por cuenta y moneda.</p>
          </div>

          <span className={styles.accountCount}>
            {summary.accountCount} cuentas
          </span>
        </div>

        {summary.accounts.length === 0 ? (
          <div className={styles.empty}>
            <p>Aún no tienes cuentas registradas.</p>
          </div>
        ) : (
          <div className={styles.accountGroups}>
            {summary.accountsByCurrency.map((group) => (
              <div
                className={styles.currencyGroup}
                key={group.currency}
              >
                <h4>{group.currency}</h4>

                <div className={styles.accountList}>
                  {group.accounts.map((account) => (
                    <article
                      className={styles.accountItem}
                      key={account.accountId}
                    >
                      <div className={styles.accountIcon}>
                        {account.accountName.charAt(0).toUpperCase()}
                      </div>

                      <div className={styles.accountInfo}>
                        <strong>{account.accountName}</strong>

                        <span className={styles.accountType}>
                          {getAccountTypeLabel(account.type)}
                        </span>

                        <span>{account.currency}</span>
                      </div>

                      <div className={styles.accountFinancial}>
                        <strong className={styles.accountBalance}>
                          {formatCurrency(account.balanceMinor, account.currency)}
                        </strong>

                        {account.type === "credit_card" && (
                          <div className={styles.creditDetails}>
                            {account.creditLimitMinor !== null ? (
                              <>
                                <div className={styles.creditMetrics}>
                                  <span>
                                    Cupo:{" "}
                                    {formatCurrency(
                                      account.creditLimitMinor,
                                      account.currency
                                    )}
                                  </span>

                                  <span>
                                    Disponible:{" "}
                                    {formatCurrency(
                                      account.availableCreditMinor ?? 0,
                                      account.currency
                                    )}
                                  </span>
                                </div>

                                <div className={styles.creditProgress}>
                                  <div
                                    className={styles.creditProgressBar}
                                    style={{
                                      width: `${Math.min(
                                        account.creditUsagePercentage ?? 0,
                                        100
                                      )}%`,
                                    }}
                                  />
                                </div>

                                <span className={styles.creditPercentage}>
                                  Utilización:{" "}
                                  {account.creditUsagePercentage !== null
                                    ? formatPercentage(account.creditUsagePercentage)
                                    : "No disponible"}
                                </span>

                                {account.overLimitMinor !== null &&
                                  account.overLimitMinor > 0 && (
                                    <span className={styles.creditWarning}>
                                      Exceso de cupo:{" "}
                                      {formatCurrency(
                                        account.overLimitMinor,
                                        account.currency
                                      )}
                                    </span>
                                  )}
                              </>
                            ) : (
                              <span className={styles.creditPercentage}>
                                Cupo no configurado
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
