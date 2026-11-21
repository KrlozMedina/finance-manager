
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  Workspace,
  WorkspaceContextValue,
} from "@/types/workspace.types";

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined
);

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({
  children,
}: WorkspaceProviderProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] =
    useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita inicializaciones duplicadas durante el montaje.
  const initialized = useRef(false);

  const refreshWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const listResponse = await fetch("/api/v1/workspaces", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const listResult: ApiResponse<Workspace[]> =
        await listResponse.json();

      if (!listResponse.ok || !listResult.success) {
        throw new Error(
          listResult.message ?? "No fue posible consultar los workspaces."
        );
      }

      const availableWorkspaces = listResult.data ?? [];
      setWorkspaces(availableWorkspaces);

      if (availableWorkspaces.length === 0) {
        setActiveWorkspace(null);
        return;
      }

      // Recuperar el workspace seleccionado en el servidor.
      const activeResponse = await fetch(
        "/api/v1/workspaces/active",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      let active: Workspace | null = null;

      if (activeResponse.ok) {
        const activeResult: ApiResponse<Workspace> =
          await activeResponse.json();

        if (activeResult.success) {
          active = activeResult.data;
        }
      }

      // Si no hay selección válida, seleccionar el primero.
      if (
        !active ||
        !availableWorkspaces.some(
          (workspace) => workspace.id === active?.id
        )
      ) {
        const firstWorkspace = availableWorkspaces[0];

        const selectResponse = await fetch(
          "/api/v1/workspaces/active",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              workspaceId: firstWorkspace.id,
            }),
          }
        );

        const selectResult: ApiResponse<Workspace> =
          await selectResponse.json();

        if (!selectResponse.ok || !selectResult.success) {
          throw new Error(
            selectResult.message ??
              "No fue posible seleccionar el workspace."
          );
        }

        active = selectResult.data;
      }

      setActiveWorkspace(active);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar los workspaces."
      );
      setActiveWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      setError(null);

      const workspace = workspaces.find(
        (item) => item.id === workspaceId
      );

      if (!workspace) {
        throw new Error("El workspace seleccionado no está disponible.");
      }

      const response = await fetch("/api/v1/workspaces/active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ workspaceId }),
      });

      const result: ApiResponse<Workspace> = await response.json();

      if (!response.ok || !result.success) {
        const message =
          result.message ?? "No fue posible cambiar el workspace.";

        setError(message);
        throw new Error(message);
      }

      setActiveWorkspace(result.data);
    },
    [workspaces]
  );

  useEffect(() => {
    if (initialized.current) return;

    initialized.current = true;
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    isLoading,
    error,
    selectWorkspace,
    refreshWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error(
      "useWorkspace debe utilizarse dentro de WorkspaceProvider."
    );
  }

  return context;
}
