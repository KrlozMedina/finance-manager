
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWorkspace } from "@/contexts/WorkspaceProvider";
import styles from "./WorkspaceSelector.module.scss";

export default function WorkspaceSelector() {
  const router = useRouter();

  const {
    workspaces,
    activeWorkspace,
    isLoading,
    error,
    selectWorkspace,
  } = useWorkspace();

  const [changing, setChanging] = useState(false);

  const handleChange = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspace?.id) return;

    try {
      setChanging(true);

      await selectWorkspace(workspaceId);

      // Actualizar los Server Components con el nuevo workspace.
      router.refresh();
    } catch (error) {
      console.error("[WorkspaceSelector]", error);
    } finally {
      setChanging(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.selector}>
        <span className={styles.loading}>Cargando workspace...</span>
      </div>
    );
  }

  if (error || !activeWorkspace) {
    return (
      <div className={styles.selector}>
        <span className={styles.error}>
          {error ?? "Sin workspace activo"}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.selector}>
      <div className={styles.info}>
        <span className={styles.label}>WORKSPACE</span>

        <strong className={styles.name}>
          {activeWorkspace.name}
        </strong>

        <span className={styles.type}>
          {activeWorkspace.type === "personal"
            ? "Personal"
            : "Compartido"}
        </span>
      </div>

      {workspaces.length > 1 && (
        <select
          className={styles.select}
          value={activeWorkspace.id}
          disabled={changing}
          onChange={(event) => {
            void handleChange(event.target.value);
          }}
          aria-label="Cambiar workspace"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      )}

      {changing && (
        <span className={styles.loading}>Cambiando...</span>
      )}
    </div>
  );
}
