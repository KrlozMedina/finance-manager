
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/contexts/ThemeProvider";
import styles from "./MainLayout.module.scss";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <div
      className={`${styles.layout} ${
        collapsed ? styles.collapsed : ""
      }`}
    >
      {mobileOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Cerrar menú"
          onClick={closeMobileMenu}
        />
      )}

      <aside
        className={`${styles.sidebar} ${
          mobileOpen ? styles.sidebarOpen : ""
        }`}
      >
        <div className={styles.brand}>
          <div className={styles.brandIcon}>F</div>

          <span className={styles.brandName}>Finance Manager</span>

          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setCollapsed((value) => !value)}
            aria-label={
              collapsed ? "Expandir menú" : "Contraer menú"
            }
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className={styles.navigation}>
          <span className={styles.sectionLabel}>GENERAL</span>

          <Link
            href="/dashboard"
            onClick={closeMobileMenu}
            className={`${styles.navItem} ${
              pathname === "/dashboard" ? styles.active : ""
            }`}
            title="Dashboard"
          >
            <span className={styles.navIcon}>▦</span>
            <span className={styles.navLabel}>Dashboard</span>
          </Link>

          <span className={styles.sectionLabel}>GESTIÓN</span>

          <div className={styles.navItemDisabled} title="Cuentas">
            <span className={styles.navIcon}>▣</span>
            <span className={styles.navLabel}>Cuentas</span>
            <span className={styles.comingSoon}>Próximo</span>
          </div>

          <div
            className={styles.navItemDisabled}
            title="Movimientos"
          >
            <span className={styles.navIcon}>⇄</span>
            <span className={styles.navLabel}>Movimientos</span>
            <span className={styles.comingSoon}>Próximo</span>
          </div>

          <div
            className={styles.navItemDisabled}
            title="Categorías"
          >
            <span className={styles.navIcon}>▤</span>
            <span className={styles.navLabel}>Categorías</span>
            <span className={styles.comingSoon}>Próximo</span>
          </div>

          <span className={styles.sectionLabel}>PLANIFICACIÓN</span>

          <div className={styles.navItemDisabled} title="Presupuestos">
            <span className={styles.navIcon}>◷</span>
            <span className={styles.navLabel}>Presupuestos</span>
            <span className={styles.comingSoon}>Próximo</span>
          </div>

          <div className={styles.navItemDisabled} title="Reportes">
            <span className={styles.navIcon}>▥</span>
            <span className={styles.navLabel}>Reportes</span>
            <span className={styles.comingSoon}>Próximo</span>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.footerInitial}>FM</span>
          <div className={styles.footerInfo}>
            <strong>Finance Manager</strong>
            <span>Gestión financiera</span>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.mobileMenuButton}
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>

            <div>
              <span className={styles.headerEyebrow}>
                FINANCE MANAGER
              </span>
              <h1 className={styles.headerTitle}>Mi espacio</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeButton}
              onClick={toggleTheme}
              aria-label={
                theme === "light"
                  ? "Activar tema oscuro"
                  : "Activar tema claro"
              }
              title={
                theme === "light" ? "Tema oscuro" : "Tema claro"
              }
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
