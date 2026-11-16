
import mongoose, { ClientSession, Types } from "mongoose";

import { CategoryModel } from "./category.model";

type CategoryType = "income" | "expense";

interface DefaultCategory {
  key: string;
  name: string;
  icon: string;
  color: string;
  children?: Omit<DefaultCategory, "children">[];
}

interface CreateDefaultCategoriesParams {
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  session: ClientSession;
}

const DEFAULT_CATEGORIES: Record<CategoryType, DefaultCategory[]> = {
  income: [
    {
      key: "salary",
      name: "Salario",
      icon: "wallet",
      color: "#16A34A",
      children: [
        { key: "salary-base", name: "Sueldo", icon: "banknote", color: "#16A34A" },
        { key: "salary-bonus", name: "Bonificaciones", icon: "gift", color: "#16A34A" },
      ],
    },
    {
      key: "business",
      name: "Negocios",
      icon: "briefcase-business",
      color: "#0D9488",
      children: [
        { key: "business-sales", name: "Ventas", icon: "shopping-bag", color: "#0D9488" },
        { key: "business-services", name: "Servicios", icon: "handshake", color: "#0D9488" },
      ],
    },
    {
      key: "investments",
      name: "Inversiones",
      icon: "chart-no-axes-combined",
      color: "#2563EB",
      children: [
        { key: "investment-dividends", name: "Dividendos", icon: "coins", color: "#2563EB" },
        { key: "investment-interest", name: "Intereses", icon: "percent", color: "#2563EB" },
      ],
    },
    {
      key: "other-income",
      name: "Otros ingresos",
      icon: "circle-dollar-sign",
      color: "#64748B",
      children: [
        { key: "income-gifts", name: "Regalos", icon: "gift", color: "#64748B" },
        { key: "income-refunds", name: "Reembolsos", icon: "undo-2", color: "#64748B" },
      ],
    },
  ],
  expense: [
    {
      key: "housing",
      name: "Vivienda",
      icon: "house",
      color: "#EA580C",
      children: [
        { key: "housing-rent", name: "Arriendo", icon: "key", color: "#EA580C" },
        { key: "housing-services", name: "Servicios públicos", icon: "plug", color: "#EA580C" },
        { key: "housing-maintenance", name: "Mantenimiento", icon: "wrench", color: "#EA580C" },
      ],
    },
    {
      key: "food",
      name: "Alimentación",
      icon: "utensils",
      color: "#D97706",
      children: [
        { key: "food-market", name: "Mercado", icon: "shopping-basket", color: "#D97706" },
        { key: "food-restaurants", name: "Restaurantes", icon: "utensils", color: "#D97706" },
      ],
    },
    {
      key: "transport",
      name: "Transporte",
      icon: "car",
      color: "#0284C7",
      children: [
        { key: "transport-fuel", name: "Combustible", icon: "fuel", color: "#0284C7" },
        { key: "transport-public", name: "Transporte público", icon: "bus", color: "#0284C7" },
        { key: "transport-maintenance", name: "Mantenimiento", icon: "wrench", color: "#0284C7" },
      ],
    },
    {
      key: "health",
      name: "Salud",
      icon: "heart-pulse",
      color: "#DC2626",
      children: [
        { key: "health-medicine", name: "Medicamentos", icon: "pill", color: "#DC2626" },
        { key: "health-consultations", name: "Consultas", icon: "stethoscope", color: "#DC2626" },
      ],
    },
    {
      key: "education",
      name: "Educación",
      icon: "graduation-cap",
      color: "#7C3AED",
      children: [
        { key: "education-courses", name: "Cursos", icon: "book-open", color: "#7C3AED" },
        { key: "education-books", name: "Libros", icon: "book", color: "#7C3AED" },
      ],
    },
    {
      key: "entertainment",
      name: "Entretenimiento",
      icon: "clapperboard",
      color: "#DB2777",
      children: [
        { key: "entertainment-cinema", name: "Cine", icon: "film", color: "#DB2777" },
        { key: "entertainment-subscriptions", name: "Suscripciones", icon: "tv", color: "#DB2777" },
        { key: "entertainment-travel", name: "Viajes", icon: "plane", color: "#DB2777" },
      ],
    },
    {
      key: "shopping",
      name: "Compras",
      icon: "shopping-cart",
      color: "#9333EA",
      children: [
        { key: "shopping-clothing", name: "Ropa", icon: "shirt", color: "#9333EA" },
        { key: "shopping-technology", name: "Tecnología", icon: "monitor", color: "#9333EA" },
      ],
    },
    {
      key: "finance",
      name: "Finanzas",
      icon: "landmark",
      color: "#475569",
      children: [
        { key: "finance-fees", name: "Comisiones", icon: "receipt", color: "#475569" },
        { key: "finance-interest", name: "Intereses", icon: "percent", color: "#475569" },
      ],
    },
    {
      key: "other-expenses",
      name: "Otros gastos",
      icon: "circle-ellipsis",
      color: "#64748B",
      children: [
        { key: "expense-unexpected", name: "Gastos imprevistos", icon: "alert-circle", color: "#64748B" },
      ],
    },
  ],
};

export async function createDefaultCategories({
  workspaceId,
  userId,
  session,
}: CreateDefaultCategoriesParams): Promise<void> {
  for (const type of ["income", "expense"] as const) {
    const parents = DEFAULT_CATEGORIES[type];

    for (const parent of parents) {
      const [createdParent] = await CategoryModel.create(
        [
          {
            workspaceId,
            name: parent.name,
            type,
            parentId: null,
            icon: parent.icon,
            color: parent.color,
            createdBy: userId,
          },
        ],
        { session }
      );

      if (!parent.children?.length) {
        continue;
      }

      await CategoryModel.create(
        parent.children.map((child) => ({
          workspaceId,
          name: child.name,
          type,
          parentId: createdParent._id,
          icon: child.icon,
          color: child.color,
          createdBy: userId,
        })),
        {
          session,
          ordered: true,
        }
      );
    }
  }
}
