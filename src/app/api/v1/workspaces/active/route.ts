
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { connectDB } from "@/lib/mongodb/connection";

import { WorkspaceModel } from "@/modules/workspaces/workspace.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

const ACTIVE_WORKSPACE_COOKIE = "fm_active_workspace";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

// GET: recuperar el workspace activo.
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes una sesión válida.",
        },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();

    const workspaceId = cookieStore.get(
      ACTIVE_WORKSPACE_COOKIE
    )?.value;

    if (!workspaceId) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes un workspace seleccionado.",
        },
        { status: 404 }
      );
    }

    if (!mongoose.isValidObjectId(workspaceId)) {
      const response = NextResponse.json(
        {
          success: false,
          message: "La selección del workspace no es válida.",
        },
        { status: 400 }
      );

      response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
      return response;
    }

    await connectDB();

    const membership = await MembershipModel.findOne({
      workspaceId,
      userId: user._id,
      status: "active",
    }).lean();

    if (!membership) {
      const response = NextResponse.json(
        {
          success: false,
          message: "Ya no tienes acceso al workspace seleccionado.",
        },
        { status: 403 }
      );

      response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
      return response;
    }

    const workspace = await WorkspaceModel.findOne({
      _id: workspaceId,
      deletedAt: null,
    })
      .select("name type defaultCurrency settings createdAt")
      .lean();

    if (!workspace) {
      const response = NextResponse.json(
        {
          success: false,
          message: "El workspace no existe o fue eliminado.",
        },
        { status: 404 }
      );

      response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
      return response;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: workspace._id.toString(),
        name: workspace.name,
        type: workspace.type,
        defaultCurrency: workspace.defaultCurrency,
        settings: workspace.settings,
        role: membership.role,
        joinedAt: membership.joinedAt,
      },
    });
  } catch (error) {
    console.error("[GET /api/v1/workspaces/active]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar el workspace activo.",
      },
      { status: 500 }
    );
  }
}

// POST: seleccionar un workspace.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes una sesión válida.",
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const workspaceId = body?.workspaceId;

    if (
      typeof workspaceId !== "string" ||
      !mongoose.isValidObjectId(workspaceId)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes proporcionar un workspaceId válido.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    const membership = await MembershipModel.findOne({
      workspaceId,
      userId: user._id,
      status: "active",
    }).lean();

    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes acceso a este workspace.",
        },
        { status: 403 }
      );
    }

    const workspace = await WorkspaceModel.findOne({
      _id: workspaceId,
      deletedAt: null,
    })
      .select("name type defaultCurrency settings")
      .lean();

    if (!workspace) {
      return NextResponse.json(
        {
          success: false,
          message: "El workspace no existe o fue eliminado.",
        },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Workspace seleccionado correctamente.",
      data: {
        id: workspace._id.toString(),
        name: workspace.name,
        type: workspace.type,
        defaultCurrency: workspace.defaultCurrency,
        settings: workspace.settings,
        role: membership.role,
      },
    });

    response.cookies.set(
      ACTIVE_WORKSPACE_COOKIE,
      workspace._id.toString(),
      COOKIE_OPTIONS
    );

    return response;
  } catch (error) {
    console.error("[POST /api/v1/workspaces/active]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al seleccionar el workspace.",
      },
      { status: 500 }
    );
  }
}
