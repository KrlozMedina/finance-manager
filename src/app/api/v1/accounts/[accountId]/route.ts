
import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { connectDB } from "@/lib/mongodb/connection";

import { AccountModel } from "@/modules/accounts/account.model";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const DETAIL_FIELDS = [
  "last4",
  "creditLimitMinor",
  "cutoffDay",
  "paymentDay",
] as const;

const serializeAccount = (account: any) => ({
  ...account,
  id: account._id.toString(),
  workspaceId: account.workspaceId.toString(),
  createdBy: account.createdBy.toString(),
});

// GET: consultar una cuenta.
export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        { success: false, message: "No tienes un workspace activo." },
        { status: 404 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId: active.workspace._id.toString(),
      permission: "accounts:read",
    });

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, message: "No tienes permiso para consultar cuentas." },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { accountId } = await params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json(
        { success: false, message: "El identificador no es válido." },
        { status: 400 }
      );
    }

    await connectDB();

    const account = await AccountModel.findOne({
      _id: accountId,
      workspaceId: active.workspace._id,
      status: "active",
      $or: [
        { visibility: "shared" },
        { createdBy: user._id },
      ],
    }).lean();

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Cuenta no encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serializeAccount(account),
    });
  } catch (error) {
    console.error("[GET /api/v1/accounts/[accountId]]", error);

    return NextResponse.json(
      { success: false, message: "Error al consultar la cuenta." },
      { status: 500 }
    );
  }
}

// PATCH: actualizar información permitida de una cuenta.
export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        { success: false, message: "No tienes un workspace activo." },
        { status: 404 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId: active.workspace._id.toString(),
      permission: "accounts:update",
    });

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, message: "No tienes permiso para actualizar cuentas." },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { accountId } = await params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json(
        { success: false, message: "El identificador no es válido." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "El cuerpo de la petición no es válido." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const allowedFields = ["name", "institution", "visibility", "details"];

    const unknownFields = Object.keys(data).filter(
      (field) => !allowedFields.includes(field)
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

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, message: "No hay campos para actualizar." },
        { status: 400 }
      );
    }

    await connectDB();

    const account = await AccountModel.findOne({
      _id: accountId,
      workspaceId: active.workspace._id,
      status: "active",
      $or: [
        { visibility: "shared" },
        { createdBy: user._id },
      ],
    });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Cuenta no encontrada." },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) {
      if (
        typeof data.name !== "string" ||
        data.name.trim().length < 2 ||
        data.name.trim().length > 100
      ) {
        return NextResponse.json(
          { success: false, message: "El nombre debe tener entre 2 y 100 caracteres." },
          { status: 400 }
        );
      }

      updates.name = data.name.trim();
    }

    if (data.institution !== undefined) {
      if (
        data.institution !== null &&
        (typeof data.institution !== "string" ||
          data.institution.trim().length > 100)
      ) {
        return NextResponse.json(
          { success: false, message: "La institución no es válida." },
          { status: 400 }
        );
      }

      updates.institution =
        typeof data.institution === "string"
          ? data.institution.trim() || null
          : null;
    }

    if (data.visibility !== undefined) {
      if (!["private", "shared"].includes(data.visibility as string)) {
        return NextResponse.json(
          { success: false, message: "La visibilidad debe ser private o shared." },
          { status: 400 }
        );
      }

      updates.visibility = data.visibility;
    }

    if (data.details !== undefined) {
      if (
        typeof data.details !== "object" ||
        data.details === null ||
        Array.isArray(data.details)
      ) {
        return NextResponse.json(
          { success: false, message: "Los detalles de la cuenta no son válidos." },
          { status: 400 }
        );
      }

      const details = data.details as Record<string, unknown>;

      const unknownDetails = Object.keys(details).filter(
        (field) => !DETAIL_FIELDS.includes(field as typeof DETAIL_FIELDS[number])
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

      for (const [field, value] of Object.entries(details)) {
        if (value === null) {
          updates[`details.${field}`] = null;
          continue;
        }

        if (field === "last4") {
          if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
            return NextResponse.json(
              { success: false, message: "last4 debe contener exactamente cuatro dígitos." },
              { status: 400 }
            );
          }
        } else if (field === "creditLimitMinor") {
          if (
            typeof value !== "number" ||
            !Number.isSafeInteger(value) ||
            value < 0
          ) {
            return NextResponse.json(
              { success: false, message: "El límite de crédito no es válido." },
              { status: 400 }
            );
          }
        } else if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 31
        ) {
          return NextResponse.json(
            { success: false, message: `${field} debe ser un número entre 1 y 31.` },
            { status: 400 }
          );
        }

        updates[`details.${field}`] = value;
      }

      const creditFields = [
        "creditLimitMinor",
        "cutoffDay",
        "paymentDay",
      ];

      if (
        account.type !== "credit_card" &&
        creditFields.some((field) => details[field] !== undefined)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Los datos de crédito solo aplican a tarjetas de crédito.",
          },
          { status: 400 }
        );
      }
    }

    const updatedAccount = await AccountModel.findOneAndUpdate(
      {
        _id: accountId,
        workspaceId: active.workspace._id,
        status: "active",
        $or: [
          { visibility: "shared" },
          { createdBy: user._id },
        ],
      },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedAccount) {
      return NextResponse.json(
        { success: false, message: "No se pudo actualizar la cuenta." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cuenta actualizada correctamente.",
      data: serializeAccount(updatedAccount),
    });
  } catch (error) {
    console.error("[PATCH /api/v1/accounts/[accountId]]", error);

    return NextResponse.json(
      { success: false, message: "Error al actualizar la cuenta." },
      { status: 500 }
    );
  }
}

// DELETE: archivar una cuenta sin eliminar su historial.
export async function DELETE(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        { success: false, message: "No tienes un workspace activo." },
        { status: 404 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId: active.workspace._id.toString(),
      permission: "accounts:archive",
    });

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, message: "No tienes permiso para archivar cuentas." },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { accountId } = await params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json(
        { success: false, message: "El identificador no es válido." },
        { status: 400 }
      );
    }

    await connectDB();

    const account = await AccountModel.findOneAndUpdate(
      {
        _id: accountId,
        workspaceId: active.workspace._id,
        status: "active",
        $or: [
          { visibility: "shared" },
          { createdBy: user._id },
        ],
      },
      { $set: { status: "archived" } },
      { new: true }
    ).lean();

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Cuenta no encontrada o ya archivada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cuenta archivada correctamente.",
      data: {
        id: account._id.toString(),
        status: account.status,
      },
    });
  } catch (error) {
    console.error("[DELETE /api/v1/accounts/[accountId]]", error);

    return NextResponse.json(
      { success: false, message: "Error al archivar la cuenta." },
      { status: 500 }
    );
  }
}
