
import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { connectDB } from "@/lib/mongodb/connection";

import { AccountModel } from "@/modules/accounts/account.model";
import { LedgerEntryModel } from "@/modules/transactions/ledger-entry.model";

const ACCOUNT_TYPES = [
  "bank",
  "savings",
  "cash",
  "digital_wallet",
  "credit_card",
  "loan_liability",
  "loan_receivable",
] as const;

type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_FIELDS = [
  "name",
  "institution",
  "type",
  "currency",
  "initialBalanceMinor",
  "openingDate",
  "visibility",
  "details",
];

const DETAIL_FIELDS = [
  "last4",
  "creditLimitMinor",
  "cutoffDay",
  "paymentDay",
];

// GET: consultar cuentas activas del workspace.
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión.",
        },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes un workspace activo.",
        },
        { status: 404 }
      );
    }

    const workspaceId = active.workspace._id.toString();

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "accounts:read",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para consultar cuentas.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    await connectDB();

    const accounts = await AccountModel.find({
      workspaceId,
      status: "active",
      $or: [
        { visibility: "shared" },
        { createdBy: user._id },
      ],
    })
      .select(
        "name institution type currency initialBalanceMinor openingDate visibility details status createdBy createdAt updatedAt"
      )
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: accounts.map((account) => ({
        ...account,
        id: account._id.toString(),
        workspaceId: account.workspaceId.toString(),
        createdBy: account.createdBy.toString(),
      })),
    });
  } catch (error) {
    console.error("[GET /api/v1/accounts]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar las cuentas.",
      },
      { status: 500 }
    );
  }
}

// POST: crear cuenta y registrar saldo inicial.
export async function POST(request: Request) {
  const session = await mongoose.startSession();

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión.",
        },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes un workspace activo.",
        },
        { status: 404 }
      );
    }

    const workspaceId = active.workspace._id.toString();

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "accounts:create",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para crear cuentas.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El cuerpo de la petición no es válido.",
        },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const unknownFields = Object.keys(data).filter(
      (field) => !ACCOUNT_FIELDS.includes(field)
    );

    if (unknownFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Campos no permitidos: ${unknownFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validar nombre.
    if (
      typeof data.name !== "string" ||
      data.name.trim().length < 2 ||
      data.name.trim().length > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre debe tener entre 2 y 100 caracteres.",
        },
        { status: 400 }
      );
    }

    // Validar tipo.
    if (
      typeof data.type !== "string" ||
      !ACCOUNT_TYPES.includes(data.type as AccountType)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El tipo de cuenta no es válido.",
        },
        { status: 400 }
      );
    }

    const type = data.type as AccountType;

    // Validar institución.
    let institution: string | null = null;

    if (data.institution !== undefined && data.institution !== null) {
      if (
        typeof data.institution !== "string" ||
        data.institution.trim().length > 100
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "La institución no es válida.",
          },
          { status: 400 }
        );
      }

      institution = data.institution.trim() || null;
    }

    // Validar moneda.
    const currency =
      data.currency === undefined
        ? active.workspace.defaultCurrency
        : data.currency;

    if (
      typeof currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(currency)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "La moneda debe tener un código de tres letras.",
        },
        { status: 400 }
      );
    }

    // Validar saldo inicial.
    const initialBalanceMinor =
      data.initialBalanceMinor === undefined
        ? 0
        : data.initialBalanceMinor;

    if (
      typeof initialBalanceMinor !== "number" ||
      !Number.isSafeInteger(initialBalanceMinor) ||
      initialBalanceMinor < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El saldo inicial debe ser un entero seguro no negativo.",
        },
        { status: 400 }
      );
    }

    // Validar fecha de apertura.
    const openingDate =
      data.openingDate === undefined
        ? new Date()
        : new Date(data.openingDate as string);

    if (
      data.openingDate !== undefined &&
      (
        typeof data.openingDate !== "string" ||
        Number.isNaN(openingDate.getTime())
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "La fecha de apertura no es válida.",
        },
        { status: 400 }
      );
    }

    // Validar visibilidad.
    const visibility =
      data.visibility === undefined ? "shared" : data.visibility;

    if (!["private", "shared"].includes(visibility as string)) {
      return NextResponse.json(
        {
          success: false,
          message: "La visibilidad debe ser private o shared.",
        },
        { status: 400 }
      );
    }

    // Validar detalles.
    let details: {
      last4?: string | null;
      creditLimitMinor?: number | null;
      cutoffDay?: number | null;
      paymentDay?: number | null;
    } = {};

    if (data.details !== undefined) {
      if (
        typeof data.details !== "object" ||
        data.details === null ||
        Array.isArray(data.details)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Los detalles de la cuenta no son válidos.",
          },
          { status: 400 }
        );
      }

      const rawDetails = data.details as Record<string, unknown>;

      const unknownDetails = Object.keys(rawDetails).filter(
        (field) => !DETAIL_FIELDS.includes(field)
      );

      if (unknownDetails.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `Detalles no permitidos: ${unknownDetails.join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (
        rawDetails.last4 !== undefined &&
        rawDetails.last4 !== null
      ) {
        if (
          typeof rawDetails.last4 !== "string" ||
          !/^\d{4}$/.test(rawDetails.last4)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "last4 debe contener exactamente cuatro dígitos.",
            },
            { status: 400 }
          );
        }

        details.last4 = rawDetails.last4;
      }

      if (
        rawDetails.creditLimitMinor !== undefined &&
        rawDetails.creditLimitMinor !== null
      ) {
        if (
          typeof rawDetails.creditLimitMinor !== "number" ||
          !Number.isSafeInteger(rawDetails.creditLimitMinor) ||
          rawDetails.creditLimitMinor < 0
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "El límite de crédito no es válido.",
            },
            { status: 400 }
          );
        }

        details.creditLimitMinor = rawDetails.creditLimitMinor;
      }

      for (const field of ["cutoffDay", "paymentDay"] as const) {
        const value = rawDetails[field];

        if (value !== undefined && value !== null) {
          if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 1 ||
            value > 31
          ) {
            return NextResponse.json(
              {
                success: false,
                message: `${field} debe ser un número entre 1 y 31.`,
              },
              { status: 400 }
            );
          }

          details[field] = value;
        }
      }
    }

    // Los datos de crédito solo aplican a tarjetas de crédito.
    if (
      type !== "credit_card" &&
      (
        details.creditLimitMinor !== undefined ||
        details.cutoffDay !== undefined ||
        details.paymentDay !== undefined
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Los datos de crédito solo aplican a tarjetas de crédito.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    let createdAccountId: mongoose.Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const [account] = await AccountModel.create(
        [
          {
            workspaceId: active.workspace._id,
            name: data.name instanceof String
              ? data.name.toString().trim()
              : (data.name as string).trim(),
            institution,
            type,
            currency: currency.toUpperCase(),
            initialBalanceMinor,
            openingDate,
            visibility,
            details,
            status: "active",
            createdBy: user._id,
          },
        ],
        { session }
      );

      // No crear entradas de apertura con importe cero.
      if (initialBalanceMinor > 0) {
        await LedgerEntryModel.create(
          [
            {
              workspaceId: active.workspace._id,
              transactionId: null,
              accountId: account._id,
              type: "opening",
              amountMinor: initialBalanceMinor,
              currency: currency.toUpperCase(),
              effectiveAt: openingDate,
              reversalOf: null,
              createdBy: user._id,
            },
          ],
          { session }
        );
      }

      createdAccountId = account._id;
    });

    if (!createdAccountId) {
      throw new Error("No se pudo crear la cuenta.");
    }

    const account = await AccountModel.findById(createdAccountId).lean();

    if (!account) {
      throw new Error("No se pudo recuperar la cuenta creada.");
    }

    return NextResponse.json(
      {
        success: true,
        message: "Cuenta creada correctamente.",
        data: {
          id: account._id.toString(),
          workspaceId: account.workspaceId.toString(),
          name: account.name,
          institution: account.institution,
          type: account.type,
          currency: account.currency,
          initialBalanceMinor: account.initialBalanceMinor,
          openingDate: account.openingDate,
          visibility: account.visibility,
          details: account.details,
          status: account.status,
          createdAt: account.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/v1/accounts]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al crear la cuenta.",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}
