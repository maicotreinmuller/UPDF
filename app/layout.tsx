import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "PDFForge Editor - Editor de PDF Completo",
  description: "Editor de PDF profissional com todas as funcionalidades",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {children}
        <div className="fixed inset-0 pointer-events-none z-[9999]">
          <Toaster />
        </div>
      </body>
    </html>
  )
}
