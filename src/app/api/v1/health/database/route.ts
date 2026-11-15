import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb/connection";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDB();

    const database = mongoose.connection.db;

    if (!database) {
      throw new Error("Database connection not available");
    }

    await database.admin().ping();

    return NextResponse.json({
      success: true,
      message: "MongoDB connection successful",
      database: database.databaseName,
      status: "connected",
    });
  } catch (error) {
    console.error("MongoDB health check failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "MongoDB connection failed",
        status: "disconnected",
      },
      { status: 500 },
    );
  }
}