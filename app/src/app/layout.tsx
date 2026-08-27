import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getUsuarioActual } from "@/lib/auth";
import { BotonSalir } from "@/components/BotonSalir";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SGS Pesantar — PE-01",
  description: "Plataforma de gestión de seguridad para buques pesqueros — Pesantar 1",
};

const ROL_LABEL: Record<string, string> = {
  bordo: "A bordo",
  tierra: "Tierra",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const usuario = await getUsuarioActual();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        {usuario && (
          <header className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2 text-sm">
              <span className="text-neutral-700">
                {usuario.nombre}
                <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {ROL_LABEL[usuario.rol] ?? usuario.rol}
                </span>
              </span>
              <BotonSalir />
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
