"use client"

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Dynamically import PDFEditor with SSR disabled to avoid DOMMatrix issues
const PDFEditor = dynamic(() => import('@/components/pdf-editor'), {
  ssr: false,
  loading: () => (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
        <p className="text-sm text-gray-500">Carregando editor...</p>
      </div>
    </div>
  )
})

export default function Home() {
  return <PDFEditor />
}