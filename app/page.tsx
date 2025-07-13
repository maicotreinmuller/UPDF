"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { PDFDocument } from "pdf-lib"
import saveAs from "file-saver"
import JSZip from "jszip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import {
  Upload,
  Plus,
  CheckSquare,
  Square,
  Trash2,
  Download,
  Archive,
  List,
  Grid3X3,
  Loader2,
  Eye,
  Check,
  X,
  RotateCcw,
} from "lucide-react"
import dynamic from "next/dynamic"

interface PDFPage {
  id: string
  pageNumber: number
  originalIndex: number
  documentIndex: number
  selected: boolean
  fileName: string
}

interface LoadedPDF {
  file: File
  pageCount: number
}

// Importar o componente PDF Editor apenas no cliente para evitar erros de SSR
const PDFEditor = dynamic(() => import("../components/pdf-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
        <p className="text-sm text-gray-500">Carregando editor...</p>
      </div>
    </div>
  ),
})

export default function UPDF() {
  const [loadedPDFs, setLoadedPDFs] = useState<LoadedPDF[]>([])
  const [pages, setPages] = useState<PDFPage[]>([])
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"list" | "blocks">("blocks")
  const [draggedPage, setDraggedPage] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [fileName, setFileName] = useState("documento-organizado")
  const [zipFileName, setZipFileName] = useState("paginas-separadas")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showZipDialog, setShowZipDialog] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [generationStep, setGenerationStep] = useState<"generating" | "success" | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addPagesInputRef = useRef<HTMLInputElement>(null)

  // Inicializar páginas quando documentos são carregados
  useEffect(() => {
    if (loadedPDFs.length > 0) {
      const allPages: PDFPage[] = []
      let pageCounter = 1

      loadedPDFs.forEach((pdf, docIndex) => {
        for (let i = 0; i < pdf.pageCount; i++) {
          allPages.push({
            id: `${docIndex}-${i}`,
            pageNumber: pageCounter++,
            originalIndex: i,
            documentIndex: docIndex,
            selected: false,
            fileName: pdf.file.name,
          })
        }
      })

      setPages(allPages)
    }
  }, [loadedPDFs])

  // Carregar PDFs
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length === 0) return

    setIsLoading(true)
    try {
      const newPDFs: LoadedPDF[] = []

      for (const file of pdfFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const pdfDoc = await PDFDocument.load(arrayBuffer)

          newPDFs.push({
            file,
            pageCount: pdfDoc.getPageCount(),
          })
        } catch (error) {
          console.error(`Erro ao carregar ${file.name}:`, error)
          toast({
            title: "Erro",
            description: `Erro ao carregar ${file.name}`,
            variant: "destructive",
          })
        }
      }

      if (newPDFs.length > 0) {
        setLoadedPDFs(newPDFs)
        toast({
          title: "Arquivos carregados",
          description: `${newPDFs.length} arquivo(s) carregado(s)`,
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar arquivos",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Adicionar páginas
  const handleAddPages = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length === 0) return

    setIsLoading(true)
    try {
      const newPDFs: LoadedPDF[] = []

      for (const file of pdfFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const pdfDoc = await PDFDocument.load(arrayBuffer)

          newPDFs.push({
            file,
            pageCount: pdfDoc.getPageCount(),
          })
        } catch (error) {
          console.error(`Erro ao carregar ${file.name}:`, error)
          toast({
            title: "Erro",
            description: `Erro ao carregar ${file.name}`,
            variant: "destructive",
          })
        }
      }

      if (newPDFs.length > 0) {
        setLoadedPDFs((prev) => [...prev, ...newPDFs])
        toast({
          title: "Páginas adicionadas",
          description: `${newPDFs.length} arquivo(s) adicionado(s)`,
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao adicionar páginas",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Seleção de páginas
  const handlePageSelection = useCallback((pageId: string, selected: boolean) => {
    if (selected) {
      setSelectedPages((prev) => [...prev, pageId])
    } else {
      setSelectedPages((prev) => prev.filter((id) => id !== pageId))
    }
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, selected } : page)))
  }, [])

  // Selecionar todas
  const selectAllPages = useCallback(() => {
    const allPageIds = pages.map((page) => page.id)
    setSelectedPages(allPageIds)
    setPages((prev) => prev.map((page) => ({ ...page, selected: true })))
  }, [pages])

  // Desmarcar todas
  const deselectAllPages = useCallback(() => {
    setSelectedPages([])
    setPages((prev) => prev.map((page) => ({ ...page, selected: false })))
  }, [])

  // Excluir selecionadas
  const deleteSelectedPages = useCallback(() => {
    if (selectedPages.length === 0) return

    const remainingPages = pages.filter((page) => !selectedPages.includes(page.id))
    setPages(remainingPages.map((page, index) => ({ ...page, pageNumber: index + 1 })))
    setSelectedPages([])

    toast({
      title: "Páginas excluídas",
      description: `${selectedPages.length} página(s) excluída(s)`,
    })
  }, [selectedPages, pages])

  // Drag and Drop
  const handleDragStart = useCallback(
    (pageId: string) => {
      setDraggedPage(pageId)

      // Se a página arrastada não está selecionada, selecionar apenas ela
      const draggedPageData = pages.find((page) => page.id === pageId)
      if (draggedPageData && !draggedPageData.selected) {
        setSelectedPages([pageId])
        setPages((prev) =>
          prev.map((page) => ({
            ...page,
            selected: page.id === pageId,
          })),
        )
      }
    },
    [pages],
  )

  const handleDragOver = useCallback((event: React.DragEvent, index: number) => {
    event.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent, targetIndex: number) => {
      event.preventDefault()

      if (!draggedPage) return

      const draggedPageData = pages.find((page) => page.id === draggedPage)
      if (!draggedPageData) return

      // Se a página arrastada está selecionada, mover todas as selecionadas
      if (draggedPageData.selected && selectedPages.length > 1) {
        // Obter todas as páginas selecionadas na ordem atual
        const selectedPagesData = pages.filter((page) => selectedPages.includes(page.id))
        const nonSelectedPages = pages.filter((page) => !selectedPages.includes(page.id))

        // Calcular a nova posição considerando as páginas não selecionadas
        let adjustedTargetIndex = targetIndex

        // Contar quantas páginas selecionadas estão antes da posição de destino
        const selectedBeforeTarget = selectedPagesData.filter((_, index) => {
          const originalIndex = pages.findIndex((p) => p.id === selectedPagesData[index].id)
          return originalIndex < targetIndex
        }).length

        // Ajustar o índice de destino
        adjustedTargetIndex = Math.max(0, targetIndex - selectedBeforeTarget)

        // Criar novo array com as páginas reorganizadas
        const newPages = [...nonSelectedPages]

        // Inserir as páginas selecionadas na nova posição
        selectedPagesData.forEach((selectedPage, index) => {
          newPages.splice(adjustedTargetIndex + index, 0, selectedPage)
        })

        // Atualizar números das páginas
        setPages(newPages.map((page, idx) => ({ ...page, pageNumber: idx + 1 })))
      } else {
        // Lógica original para uma única página
        const draggedIndex = pages.findIndex((page) => page.id === draggedPage)
        if (draggedIndex === -1) return

        const newPages = [...pages]
        const draggedPageData = newPages[draggedIndex]

        newPages.splice(draggedIndex, 1)
        newPages.splice(targetIndex, 0, draggedPageData)

        setPages(newPages.map((page, idx) => ({ ...page, pageNumber: idx + 1 })))
      }

      setDraggedPage(null)
      setDragOverIndex(null)
    },
    [draggedPage, pages, selectedPages],
  )

  // Gerar PDF organizado
  const generateOrganizedPDF = useCallback(async () => {
    if (pages.length === 0) return

    setGenerationStep("generating")
    setIsGenerating(true)

    try {
      const finalDoc = await PDFDocument.create()

      // Agrupar páginas por documento para otimizar
      const pagesByDoc = new Map<number, number[]>()

      pages.forEach((page) => {
        const [docIndex, pageIndex] = page.id.split("-").map(Number)
        if (!pagesByDoc.has(docIndex)) {
          pagesByDoc.set(docIndex, [])
        }
        pagesByDoc.get(docIndex)!.push(pageIndex)
      })

      // Processar cada documento
      for (const [docIndex, pageIndices] of pagesByDoc.entries()) {
        const pdf = loadedPDFs[docIndex]
        if (!pdf) continue

        try {
          const arrayBuffer = await pdf.file.arrayBuffer()
          const sourceDoc = await PDFDocument.load(arrayBuffer)

          // Copiar páginas na ordem correta
          for (const page of pages) {
            const [pageDocIndex, pageIndex] = page.id.split("-").map(Number)
            if (pageDocIndex === docIndex) {
              const [copiedPage] = await finalDoc.copyPages(sourceDoc, [pageIndex])
              finalDoc.addPage(copiedPage)
            }
          }
        } catch (error) {
          console.error(`Erro ao processar documento ${pdf.file.name}:`, error)
        }
      }

      const pdfBytes = await finalDoc.save()
      const blob = new Blob([pdfBytes], { type: "application/pdf" })
      saveAs(blob, `${fileName}.pdf`)

      setGenerationStep("success")

      // Fechar modal após animação
      setTimeout(() => {
        setShowSaveDialog(false)
        setGenerationStep(null)
        toast({
          title: "PDF salvo",
          description: "Documento organizado salvo com sucesso!",
        })
      }, 1500)
    } catch (error) {
      console.error("Erro ao gerar PDF:", error)
      setGenerationStep(null)
      toast({
        title: "Erro",
        description: "Erro ao gerar PDF",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [pages, loadedPDFs, fileName])

  // Gerar páginas separadamente em ZIP
  const generateSeparatePages = useCallback(async () => {
    if (pages.length === 0) return

    setGenerationStep("generating")
    setIsGenerating(true)

    try {
      const zip = new JSZip()

      for (const page of pages) {
        const [docIndex, pageIndex] = page.id.split("-").map(Number)
        const pdf = loadedPDFs[docIndex]

        if (pdf) {
          try {
            const arrayBuffer = await pdf.file.arrayBuffer()
            const sourceDoc = await PDFDocument.load(arrayBuffer)
            const singlePageDoc = await PDFDocument.create()
            const [copiedPage] = await singlePageDoc.copyPages(sourceDoc, [pageIndex])
            singlePageDoc.addPage(copiedPage)

            const pdfBytes = await singlePageDoc.save()
            zip.file(`pagina-${page.pageNumber}.pdf`, pdfBytes)
          } catch (error) {
            console.error(`Erro ao gerar página ${page.pageNumber}:`, error)
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" })
      saveAs(zipBlob, `${zipFileName}.zip`)

      setGenerationStep("success")

      // Fechar modal após animação
      setTimeout(() => {
        setShowZipDialog(false)
        setGenerationStep(null)
        toast({
          title: "ZIP gerado",
          description: `${pages.length} página(s) salva(s) em ZIP`,
        })
      }, 1500)
    } catch (error) {
      console.error("Erro ao gerar páginas:", error)
      setGenerationStep(null)
      toast({
        title: "Erro",
        description: "Erro ao gerar páginas",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [pages, loadedPDFs, zipFileName])

  // Limpar página
  const clearPage = useCallback(() => {
    setLoadedPDFs([])
    setPages([])
    setSelectedPages([])
    setShowPreview(false)
    setFileName("documento-organizado")
    setZipFileName("paginas-separadas")

    toast({
      title: "Página limpa",
      description: "Todos os arquivos foram removidos",
    })
  }, [])

  // Drag & Drop para área vazia
  const handleEmptyAreaDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleEmptyAreaDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleEmptyAreaDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files)
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length === 0) {
      toast({
        title: "Erro",
        description: "Apenas arquivos PDF são aceitos",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const newPDFs: LoadedPDF[] = []

      for (const file of pdfFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const pdfDoc = await PDFDocument.load(arrayBuffer)

          newPDFs.push({
            file,
            pageCount: pdfDoc.getPageCount(),
          })
        } catch (error) {
          console.error(`Erro ao carregar ${file.name}:`, error)
          toast({
            title: "Erro",
            description: `Erro ao carregar ${file.name}`,
            variant: "destructive",
          })
        }
      }

      if (newPDFs.length > 0) {
        setLoadedPDFs(newPDFs)
        toast({
          title: "Arquivos carregados",
          description: `${newPDFs.length} arquivo(s) carregado(s)`,
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar arquivos",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <PDFEditor
      loadedPDFs={loadedPDFs}
      setLoadedPDFs={setLoadedPDFs}
      pages={pages}
      setPages={setPages}
      selectedPages={selectedPages}
      setSelectedPages={setSelectedPages}
      viewMode={viewMode}
      setViewMode={setViewMode}
      draggedPage={draggedPage}
      setDraggedPage={setDraggedPage}
      dragOverIndex={dragOverIndex}
      setDragOverIndex={setDragOverIndex}
      fileName={fileName}
      setFileName={setFileName}
      zipFileName={zipFileName}
      setZipFileName={setZipFileName}
      isGenerating={isGenerating}
      setIsGenerating={setIsGenerating}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
      showSaveDialog={showSaveDialog}
      setShowSaveDialog={setShowSaveDialog}
      showZipDialog={showZipDialog}
      setShowZipDialog={setShowZipDialog}
      showPreview={showPreview}
      setShowPreview={setShowPreview}
      generationStep={generationStep}
      setGenerationStep={setGenerationStep}
      isDragOver={isDragOver}
      setIsDragOver={setIsDragOver}
      fileInputRef={fileInputRef}
      addPagesInputRef={addPagesInputRef}
      handleFileUpload={handleFileUpload}
      handleAddPages={handleAddPages}
      handlePageSelection={handlePageSelection}
      selectAllPages={selectAllPages}
      deselectAllPages={deselectAllPages}
      deleteSelectedPages={deleteSelectedPages}
      handleDragStart={handleDragStart}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      generateOrganizedPDF={generateOrganizedPDF}
      generateSeparatePages={generateSeparatePages}
      clearPage={clearPage}
      handleEmptyAreaDragOver={handleEmptyAreaDragOver}
      handleEmptyAreaDragLeave={handleEmptyAreaDragLeave}
      handleEmptyAreaDrop={handleEmptyAreaDrop}
    />
  )
}