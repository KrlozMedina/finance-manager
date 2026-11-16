
import mongoose from "mongoose";

import { CategoryModel } from "./category.model";

import { TransactionModel } from "@/modules/transactions/transaction.model";

interface GetCategoriesParams {
  workspaceId: string;
  includeArchived?: boolean;
}

interface CreateCategoryParams {
  workspaceId: string;
  userId: string;
  name: string;
  type: "income" | "expense";
  parentId?: string | null;
  icon?: string;
  color?: string;
}

export class CategoryServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "CategoryServiceError";
  }
}

export async function getCategories({
  workspaceId,
  includeArchived = false,
}: GetCategoriesParams) {
  const filter: Record<string, unknown> = {
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
  };

  if (!includeArchived) {
    filter.status = "active";
  }

  const categories = await CategoryModel.find(filter)
    .select(
      "_id name type parentId icon color status createdAt updatedAt"
    )
    .sort({ name: 1 })
    .lean();

  type CategoryDocument = (typeof categories)[number];

  type CategoryNode = {
    id: string;
    name: string;
    type: "income" | "expense";
    icon: string;
    color: string;
    status: "active" | "archived";
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    children: CategoryNode[];
  };

  const categoryMap = new Map<string, CategoryNode>();

  for (const category of categories) {
    const id = category._id.toString();

    categoryMap.set(id, {
      id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      status: category.status,
      parentId: category.parentId?.toString() ?? null,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      children: [],
    });
  }

  const income: CategoryNode[] = [];
  const expense: CategoryNode[] = [];

  for (const category of categories as CategoryDocument[]) {
    const node = categoryMap.get(category._id.toString());

    if (!node) {
      continue;
    }

    if (node.parentId) {
      const parent = categoryMap.get(node.parentId);

      if (parent) {
        parent.children.push(node);
      }

      continue;
    }

    if (node.type === "income") {
      income.push(node);
    } else {
      expense.push(node);
    }
  }

  return {
    income,
    expense,
    total: categories.length,
  };
}

export async function createCategory({
  workspaceId,
  userId,
  name,
  type,
  parentId = null,
  icon,
  color,
}: CreateCategoryParams) {
  if (
    !mongoose.isValidObjectId(workspaceId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    throw new CategoryServiceError(
      "El workspace o usuario no es válido.",
      400
    );
  }

  const normalizedName = name.trim();

  if (normalizedName.length < 2 || normalizedName.length > 60) {
    throw new CategoryServiceError(
      "El nombre debe tener entre 2 y 60 caracteres.",
      400
    );
  }

  if (type !== "income" && type !== "expense") {
    throw new CategoryServiceError(
      "El tipo de categoría no es válido.",
      400
    );
  }

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  let parentObjectId: mongoose.Types.ObjectId | null = null;

  if (parentId !== null && parentId !== undefined) {
    if (!mongoose.isValidObjectId(parentId)) {
      throw new CategoryServiceError(
        "La categoría padre no es válida.",
        400
      );
    }

    parentObjectId = new mongoose.Types.ObjectId(parentId);

    const parent = await CategoryModel.findOne({
      _id: parentObjectId,
      workspaceId: workspaceObjectId,
      type,
      status: "active",
      parentId: null,
    });

    if (!parent) {
      throw new CategoryServiceError(
        "La categoría padre no existe, no está activa o no pertenece al workspace.",
        400
      );
    }
  }

  const escapedName = normalizedName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const duplicate = await CategoryModel.findOne({
    workspaceId: workspaceObjectId,
    type,
    parentId: parentObjectId,
    name: { $regex: `^${escapedName}$`, $options: "i" },
  });

  if (duplicate) {
    throw new CategoryServiceError(
      "Ya existe una categoría con ese nombre en este nivel.",
      409
    );
  }

  const category = await CategoryModel.create({
    workspaceId: workspaceObjectId,
    name: normalizedName,
    type,
    parentId: parentObjectId,
    icon,
    color,
    createdBy: new mongoose.Types.ObjectId(userId),
  });

  return category;
}


interface UpdateCategoryParams {
  workspaceId: string;
  categoryId: string;
  name?: string;
  icon?: string;
  color?: string;
  status?: "active" | "archived";
}

export async function updateCategory({
  workspaceId,
  categoryId,
  name,
  icon,
  color,
  status,
}: UpdateCategoryParams) {
  if (
    !mongoose.isValidObjectId(workspaceId) ||
    !mongoose.isValidObjectId(categoryId)
  ) {
    throw new CategoryServiceError(
      "El workspace o la categoría no son válidos.",
      400
    );
  }

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  const category = await CategoryModel.findOne({
    _id: categoryId,
    workspaceId: workspaceObjectId,
  });

  if (!category) {
    throw new CategoryServiceError(
      "La categoría no existe en este workspace.",
      404
    );
  }

  const hasName = name !== undefined;
  const hasIcon = icon !== undefined;
  const hasColor = color !== undefined;
  const hasStatus = status !== undefined;

  if (!hasName && !hasIcon && !hasColor && !hasStatus) {
    throw new CategoryServiceError(
      "No se proporcionaron campos para actualizar.",
      400
    );
  }

  if (hasName) {
    const normalizedName = name.trim();

    if (
      normalizedName.length < 2 ||
      normalizedName.length > 60
    ) {
      throw new CategoryServiceError(
        "El nombre debe tener entre 2 y 60 caracteres.",
        400
      );
    }

    const escapedName = normalizedName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const duplicate = await CategoryModel.findOne({
      _id: { $ne: category._id },
      workspaceId: workspaceObjectId,
      type: category.type,
      parentId: category.parentId,
      name: { $regex: `^${escapedName}$`, $options: "i" },
    });

    if (duplicate) {
      throw new CategoryServiceError(
        "Ya existe una categoría con ese nombre en este nivel.",
        409
      );
    }

    const transactionReference = await TransactionModel.exists({
      workspaceId: workspaceObjectId,
      $or: [
        { categoryId: category._id },
        { "splits.categoryId": category._id },
      ],
    });

    if (transactionReference) {
      throw new CategoryServiceError(
        "No puedes cambiar el nombre de una categoría que tiene movimientos asociados.",
        409
      );
    }

    category.name = normalizedName;
  }

  if (hasIcon) {
    if (icon.length > 50) {
      throw new CategoryServiceError(
        "El icono no puede superar los 50 caracteres.",
        400
      );
    }

    category.icon = icon;
  }

  if (hasColor) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new CategoryServiceError(
        "El color debe tener formato hexadecimal #RRGGBB.",
        400
      );
    }

    category.color = color;
  }

  if (hasStatus) {
    if (status !== "active" && status !== "archived") {
      throw new CategoryServiceError(
        "El estado de la categoría no es válido.",
        400
      );
    }

    if (status === "archived" && category.parentId === null) {
      const activeChildren = await CategoryModel.exists({
        workspaceId: workspaceObjectId,
        parentId: category._id,
        status: "active",
      });

      if (activeChildren) {
        throw new CategoryServiceError(
          "Debes archivar primero las subcategorías activas.",
          409
        );
      }
    }

    if (status === "active" && category.parentId) {
      const parent = await CategoryModel.findOne({
        _id: category.parentId,
        workspaceId: workspaceObjectId,
        status: "active",
      });

      if (!parent) {
        throw new CategoryServiceError(
          "No puedes activar una subcategoría cuya categoría principal está archivada.",
          409
        );
      }
    }

    category.status = status;
  }

  await category.save();

  return category;
}
