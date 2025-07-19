"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { Document, Page, pdfjs } from "react-pdf"
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
  RotateCw,
} from "lucide-react"

// Configurar worker do PDF.js apenas no cliente
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
}

interface PDFPage {
  id: string
  pageNumber: number
  originalIndex: number
  documentIndex: number
  selected: boolean
  fileName: string
  rotation: number
}

interface LoadedPDF {
  file: File
  pageCount: number
}

const PageThumbnail = ({ page, pdf, scale = 0.2 }: { page: PDFPage; pdf: LoadedPDF; scale?: number }) => {
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Verificar se estamos no cliente antes de renderizar
  if (typeof window !== "undefined") {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded p-4 min-h-[100px]">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  // Calcular dimensões baseado na rotação
  const isRotated = page.rotation === 90 || page.rotation === 270
  const containerStyle = isRotated
    ? {
        width: "auto",
        height: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: isRotated ? "120px" : "80px",
        minWidth: isRotated ? "80px" : "120px",
      }
    : {
        width: "auto",
        height: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80px",
        minWidth: "120px",
      }

  return (
    <div className="relative flex items-center justify-center" style={containerStyle}>
      {isPageLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
      {hasError ? (
        <div className="flex items-center justify-center bg-gray-100 rounded p-4 min-h-[100px]">
          <span className="text-xs text-gray-500">Erro ao carregar</span>
        </div>
      ) : (
        <div
          className="transition-transform duration-300 flex items-center justify-center"
          style={{
            transform: `rotate(${page.rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          <Document
            file={pdf.file}
            onLoadSuccess={() => setIsPageLoading(false)}
            onLoadError={(error) => {
              console.error("Erro ao carregar documento:", error)
              setHasError(true)
              setIsPageLoading(false)
            }}
            loading=""
            key={`${page.id}-${pdf.file.name}`}
          >
            <Page
              pageNumber={page.originalIndex + 1}
              scale={scale}
              className="pointer-events-none"
              loading=""
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadError={(error) => {
                console.error("Erro ao carregar página:", error)
                setHasError(true)
                setIsPageLoading(false)
              }}
            />
          </Document>
        </div>
      )}
    </div>
  )
}

const PreviewView = ({ pages, loadedPDFs }: { pages: PDFPage[]; loadedPDFs: LoadedPDF[] }) => {
  // Verificar se estamos no cliente antes de renderizar
  if (typeof window === "undefined") {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center gap-8 p-8 px-16">
        {pages.map((page) => {
          const pdf = loadedPDFs[page.documentIndex]
          if (!pdf) return null

          const isRotated = page.rotation === 90 || page.rotation === 270
          const containerClass = isRotated
            ? "shadow-lg border rounded-lg overflow-hidden max-w-[80vh] max-h-[60vw]"
            : "shadow-lg border rounded-lg overflow-hidden max-w-[60vw] max-h-[80vh]"

          return (
            <div key={page.id} className={containerClass}>
              <div
                className="transition-transform duration-300 flex items-center justify-center bg-white"
                style={{
                  transform: `rotate(${page.rotation}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <Document file={pdf.file} key={`preview-full-${page.id}`}>
                  <Page
                    pageNumber={page.originalIndex + 1}
                    scale={isRotated ? 1.0 : 1.2}
                    className="pointer-events-none"
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              </div>
              <div className="p-3 bg-gray-50 text-center text-sm text-gray-600">
                Página {page.pageNumber} - {page.fileName}
                {page.rotation > 0 && <span className="ml-2 text-blue-600">({page.rotation}°)</span>}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

export default function PDFEditor() {
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
  const [isClient, setIsClient] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addPagesInputRef = useRef<HTMLInputElement>(null)

  // Verificar se estamos no cliente
  useEffect(() => {
    setIsClient(true)
  }, [])

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
            rotation: 0,
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

              // Aplicar rotação se necessário - mantendo dimensões originais
              if (page.rotation > 0) {
                copiedPage.setRotation({ angle: page.rotation, type: "degrees" })
              }

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

            // Aplicar rotação se necessário - mantendo dimensões originais
            if (page.rotation > 0) {
              copiedPage.setRotation({ angle: page.rotation, type: "degrees" })
            }

            singlePageDoc.addPage(copiedPage)
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

  // Rotacionar página
  const rotatePage = useCallback((pageId: string) => {
    setPages((prev) =>
      prev.map((page) => (page.id === pageId ? { ...page, rotation: (page.rotation + 90) % 360 } : page)),
    )

    toast({
      title: "Página rotacionada",
      description: "Página rotacionada em 90°",
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

  // Mostrar loading enquanto não estiver no cliente
  if (!isClient) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p className="text-sm text-gray-500">Carregando editor...</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex flex-col pt-20">
        {/* Header Minimalista */}
        <div className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md bg-white/80 p-4">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2">
              {/* Visualização */}
              <div className="flex border rounded-md">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={viewMode === "list" ? "default" : "ghost"}
                      onClick={() => setViewMode("list")}
                      className="rounded-r-none"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Lista</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={viewMode === "blocks" ? "default" : "ghost"}
                      onClick={() => setViewMode("blocks")}
                      className="rounded-l-none"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Blocos</TooltipContent>
                </Tooltip>
              </div>

              {/* Ações principais */}
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="hidden"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Carregar arquivos</TooltipContent>
              </Tooltip>

              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleAddPages}
                ref={addPagesInputRef}
                className="hidden"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addPagesInputRef.current?.click()}
                    disabled={isLoading}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Adicionar novo arquivo</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={selectAllPages} disabled={pages.length === 0}>
                    <CheckSquare className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Selecionar todas</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={deselectAllPages} disabled={selectedPages.length === 0}>
                    <Square className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Desmarcar todas</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelectedPages}
                    disabled={selectedPages.length === 0}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Excluir selecionadas</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={clearPage} disabled={pages.length === 0}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Limpar página</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      selectedPages.forEach((pageId) => rotatePage(pageId))
                    }}
                    disabled={selectedPages.length === 0}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotacionar páginas selecionadas</TooltipContent>
              </Tooltip>

              {showPreview ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => setShowPreview(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fechar prévia</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                      disabled={pages.length === 0}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Prévia</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => setShowSaveDialog(true)}
                    disabled={pages.length === 0 || isGenerating}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Salvar PDF</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowZipDialog(true)}
                    disabled={pages.length === 0 || isGenerating}
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Salvar páginas separadamente</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 p-4 pb-16 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                <p className="text-sm text-gray-500">Carregando arquivos...</p>
              </div>
            </div>
          ) : showPreview && pages.length > 0 ? (
            <PreviewView pages={pages} loadedPDFs={loadedPDFs} />
          ) : pages.length > 0 ? (
            <ScrollArea className="h-full">
              {viewMode === "blocks" ? (
                // Visualização em blocos
                <div className="grid grid-cols-6 gap-4 px-8 py-4">
                  {pages.map((page, index) => {
                    const pdf = loadedPDFs[page.documentIndex]
                    if (!pdf) return null

                    return (
                      <div key={page.id} className="relative">
                        {/* Indicador de drop */}
                        {dragOverIndex === index && (
                          <div className="absolute -left-2 top-0 bottom-0 w-1 bg-blue-500 rounded z-10" />
                        )}

                        <div
                          className={`border-2 rounded-lg overflow-hidden cursor-move transition-all ${
                            page.selected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                          } ${draggedPage === page.id ? "opacity-50" : ""} ${
                            draggedPage && selectedPages.includes(page.id) && selectedPages.length > 1
                              ? "ring-2 ring-blue-300"
                              : ""
                          }`}
                          draggable
                          onDragStart={() => handleDragStart(page.id)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          style={{
                            minHeight: page.rotation === 90 || page.rotation === 270 ? "180px" : "160px",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          {/* Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <Checkbox
                              checked={page.selected}
                              onCheckedChange={(checked) => handlePageSelection(page.id, checked as boolean)}
                              className="bg-white shadow-sm"
                            />
                          </div>

                          {/* Botão de rotação */}
                          <div className="absolute top-2 right-2 z-10">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-6 h-6 p-0 bg-white shadow-sm hover:bg-gray-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                rotatePage(page.id)
                              }}
                            >
                              <RotateCw className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Página */}
                          <PageThumbnail page={page} pdf={pdf} scale={0.2} />

                          {/* Info */}
                          <div className="p-2 bg-white border-t">
                            <div className="text-xs font-medium">{page.pageNumber}</div>
                            <div className="text-xs text-gray-500 truncate">{page.fileName}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                // Visualização em lista
                <div className="space-y-2 px-8 py-4">
                  {pages.map((page, index) => {
                    const pdf = loadedPDFs[page.documentIndex]
                    if (!pdf) return null

                    return (
                      <div key={page.id} className="relative">
                        {/* Indicador de drop */}
                        {dragOverIndex === index && (
                          <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded z-10" />
                        )}

                        <div
                          className={`flex items-center p-3 border rounded-lg cursor-move transition-all ${
                            page.selected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                          } ${draggedPage === page.id ? "opacity-50" : ""} ${
                            draggedPage && selectedPages.includes(page.id) && selectedPages.length > 1
                              ? "ring-2 ring-blue-300"
                              : ""
                          }`}
                          draggable
                          onDragStart={() => handleDragStart(page.id)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                        >
                          <Checkbox
                            checked={page.selected}
                            onCheckedChange={(checked) => handlePageSelection(page.id, checked as boolean)}
                            className="mr-3"
                          />

                          <div
                            className="border rounded overflow-hidden mr-3 flex-shrink-0 flex items-center justify-center bg-gray-50"
                            style={{
                              width: page.rotation === 90 || page.rotation === 270 ? "80px" : "64px",
                              height: page.rotation === 90 || page.rotation === 270 ? "64px" : "80px",
                            }}
                          >
                            <PageThumbnail page={page} pdf={pdf} scale={0.12} />
                          </div>

                          <div className="flex-1">
                            <div className="font-medium">Página {page.pageNumber}</div>
                            <div className="text-sm text-gray-500">{page.fileName}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          ) : (
            <div
              className={`flex items-center justify-center h-full cursor-pointer transition-all ${
                isDragOver ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleEmptyAreaDragOver}
              onDragLeave={handleEmptyAreaDragLeave}
              onDrop={handleEmptyAreaDrop}
            >
              <div className="text-center text-gray-500 p-8 border-2 border-dashed border-gray-300 rounded-lg max-w-md">
                <Upload
                  className={`w-16 h-16 mx-auto mb-4 transition-all ${
                    isDragOver ? "text-blue-500 scale-110" : "opacity-50"
                  }`}
                />
                <h3 className="text-lg font-medium mb-2">
                  {isDragOver ? "Solte os arquivos aqui" : "Nenhum documento"}
                </h3>
                <p className="text-sm">
                  {isDragOver
                    ? "Solte os arquivos PDF para carregar"
                    : "Clique aqui ou arraste arquivos PDF para começar"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        {pages.length > 0 && !showPreview && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t p-3 bg-white/80 backdrop-blur-md">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{pages.length} páginas</span>
              {selectedPages.length > 0 && <span>{selectedPages.length} selecionadas</span>}
            </div>
          </div>
        )}

        {/* Modal Salvar PDF */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Salvar PDF Organizado</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {generationStep === "generating" ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                    <p className="text-sm">Gerando PDF...</p>
                  </div>
                </div>
              ) : generationStep === "success" ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-sm font-medium">PDF gerado com sucesso!</p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="filename">Nome do arquivo</Label>
                    <Input
                      id="filename"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="documento-organizado"
                    />
                  </div>
                  <Button onClick={generateOrganizedPDF} className="w-full" disabled={isGenerating}>
                    Salvar PDF
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Salvar ZIP */}
        <Dialog open={showZipDialog} onOpenChange={setShowZipDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Salvar Páginas Separadamente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {generationStep === "generating" ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                    <p className="text-sm">Gerando ZIP...</p>
                  </div>
                </div>
              ) : generationStep === "success" ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-sm font-medium">ZIP gerado com sucesso!</p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="zipfilename">Nome do arquivo ZIP</Label>
                    <Input
                      id="zipfilename"
                      value={zipFileName}
                      onChange={(e) => setZipFileName(e.target.value)}
                      placeholder="paginas-separadas"
                    />
                  </div>
                  <Button onClick={generateSeparatePages} className="w-full" disabled={isGenerating}>
                    Salvar ZIP
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
