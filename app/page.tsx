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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import {
  Upload,
  Plus,
  CheckSquare,
  Square,
  Trash2,
  Download,
  Archive,
  Grid3X3,
  Loader2,
  Eye,
  Check,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Search,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Edit3,
  Type,
  Eraser,
  Sun,
  Moon,
  Move,
  BrushIcon as Broom,
} from "lucide-react"

// Configurar worker do PDF.js
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

interface Annotation {
  id: string
  type: "highlight" | "draw" | "text" | "shape"
  pageIndex: number
  color: string
  strokeWidth: number
  points?: { x: number; y: number }[]
  text?: string
  x?: number
  y?: number
  width?: number
  height?: number
  shapeType?: "rectangle" | "circle" | "line"
}

interface TextElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  color: string
  pageIndex: number
  isEditing: boolean
}

const highlightColors = [
  { name: "Amarelo", value: "#FFFF00" },
  { name: "Verde", value: "#00FF00" },
  { name: "Azul", value: "#0080FF" },
  { name: "Rosa", value: "#FF69B4" },
  { name: "Laranja", value: "#FFA500" },
]

const drawColors = [
  { name: "Vermelho", value: "#FF0000" },
  { name: "Azul", value: "#0000FF" },
  { name: "Verde", value: "#008000" },
  { name: "Preto", value: "#000000" },
  { name: "Roxo", value: "#800080" },
]

const PageThumbnail = ({ page, pdf, scale = 0.15 }: { page: PDFPage; pdf: LoadedPDF; scale?: number }) => {
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const isRotated = page.rotation === 90 || page.rotation === 270
  const containerStyle = {
    width: "auto",
    height: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: isRotated ? "120px" : "80px",
    minWidth: isRotated ? "80px" : "120px",
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

export default function UnifiedPDFEditor() {
  // Estados principais
  const [loadedPDFs, setLoadedPDFs] = useState<LoadedPDF[]>([])
  const [pages, setPages] = useState<PDFPage[]>([])
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [textElements, setTextElements] = useState<TextElement[]>([])

  // Estados de interface
  const [viewMode, setViewMode] = useState<"organize" | "view">("organize")
  const [currentTool, setCurrentTool] = useState<"select" | "highlight" | "draw" | "text" | "shape" | "erase">("select")
  const [currentColor, setCurrentColor] = useState(highlightColors[0])
  const [scale, setScale] = useState(1.0)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [showAnnotationToolbar, setShowAnnotationToolbar] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  // Estados de interação
  const [draggedPage, setDraggedPage] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Estados de modais
  const [fileName, setFileName] = useState("documento-organizado")
  const [zipFileName, setZipFileName] = useState("paginas-separadas")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showZipDialog, setShowZipDialog] = useState(false)
  const [generationStep, setGenerationStep] = useState<"generating" | "success" | null>(null)
  const [loadingModal, setLoadingModal] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addPagesInputRef = useRef<HTMLInputElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())

  // Zoom presets
  const zoomLevels = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]

  // Mensagens de loading
  const loadingMessages = [
    "Importando seu arquivo...",
    "Organizando tudo...",
    "Preparando as páginas...",
    "Calma, quase lá!!",
    "Finalizando...",
  ]

  // Função para mostrar mensagens de loading
  const showLoadingWithMessages = async () => {
    setLoadingModal(true)
    for (let i = 0; i < loadingMessages.length; i++) {
      setLoadingMessage(loadingMessages[i])
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }

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
      if (allPages.length > 0) {
        setViewMode("view")
      }
    }
  }, [loadedPDFs])

  // Funções de zoom
  const zoomIn = useCallback(() => {
    const currentIndex = zoomLevels.findIndex((level) => level >= scale)
    const nextIndex = Math.min(currentIndex + 1, zoomLevels.length - 1)
    setScale(zoomLevels[nextIndex])
  }, [scale])

  const zoomOut = useCallback(() => {
    const currentIndex = zoomLevels.findIndex((level) => level >= scale)
    const prevIndex = Math.max(currentIndex - 1, 0)
    setScale(zoomLevels[prevIndex])
  }, [scale])

  // Navegação de páginas
  const goToPage = useCallback(
    (pageNum: number) => {
      const newIndex = Math.max(0, Math.min(pageNum - 1, pages.length - 1))
      setCurrentPageIndex(newIndex)
    },
    [pages.length],
  )

  const nextPage = useCallback(() => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1)
    }
  }, [currentPageIndex, pages.length])

  const prevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1)
    }
  }, [currentPageIndex])

  // Carregar PDFs
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length === 0) return

    setIsLoading(true)
    showLoadingWithMessages()

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
      setLoadingModal(false)
    }
  }, [])

  // Adicionar páginas
  const handleAddPages = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length === 0) return

    setIsLoading(true)
    showLoadingWithMessages()

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
      setLoadingModal(false)
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

  // Limpar página
  const clearPage = useCallback(() => {
    setLoadedPDFs([])
    setPages([])
    setSelectedPages([])
    setAnnotations([])
    setTextElements([])
    setViewMode("organize")
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
    showLoadingWithMessages()

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
      setLoadingModal(false)
    }
  }, [])

  // Desenhar anotações
  const drawAnnotations = useCallback(
    (pageIndex: number) => {
      const canvas = canvasRefs.current.get(pageIndex)
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      annotations
        .filter((annotation) => annotation.pageIndex === pageIndex)
        .forEach((annotation) => {
          ctx.strokeStyle = annotation.color
          ctx.lineWidth = annotation.strokeWidth
          ctx.lineCap = "round"
          ctx.lineJoin = "round"

          if (annotation.type === "highlight") {
            ctx.globalCompositeOperation = "multiply"
            ctx.globalAlpha = 0.3
          } else {
            ctx.globalCompositeOperation = "source-over"
            ctx.globalAlpha = 1
          }

          if (annotation.points && annotation.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(annotation.points[0].x, annotation.points[0].y)
            for (let i = 1; i < annotation.points.length; i++) {
              ctx.lineTo(annotation.points[i].x, annotation.points[i].y)
            }
            ctx.stroke()
          }
        })

      // Desenhar caminho atual apenas na página ativa
      if (currentPath.length > 1 && pageIndex === currentPageIndex) {
        ctx.strokeStyle = currentColor.value
        ctx.lineWidth = 2
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.globalCompositeOperation = currentTool === "highlight" ? "multiply" : "source-over"
        ctx.globalAlpha = currentTool === "highlight" ? 0.3 : 1

        ctx.beginPath()
        ctx.moveTo(currentPath[0].x, currentPath[0].y)
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x, currentPath[i].y)
        }
        ctx.stroke()
      }
    },
    [annotations, currentPath, currentColor, currentTool, currentPageIndex],
  )

  // Eventos do mouse para anotações
  const getMousePosition = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
      if (currentTool === "select") return

      const pos = getMousePosition(e)
      setCurrentPageIndex(pageIndex)

      if (currentTool === "draw" || currentTool === "highlight") {
        setIsDrawing(true)
        setCurrentPath([pos])
      }
    },
    [currentTool, getMousePosition],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return

      const pos = getMousePosition(e)
      setCurrentPath((prev) => [...prev, pos])
    },
    [isDrawing, getMousePosition],
  )

  const handleMouseUp = useCallback(
    (pageIndex: number) => {
      if (!isDrawing || currentPath.length < 2) {
        setIsDrawing(false)
        setCurrentPath([])
        return
      }

      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: currentTool as "highlight" | "draw",
        points: [...currentPath],
        color: currentColor.value,
        strokeWidth: 2,
        pageIndex,
      }

      setAnnotations((prev) => [...prev, newAnnotation])
      setIsDrawing(false)
      setCurrentPath([])
    },
    [isDrawing, currentPath, currentTool, currentColor],
  )

  // Scroll com zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (e.deltaY < 0) {
          zoomIn()
        } else {
          zoomOut()
        }
      }
    },
    [zoomIn, zoomOut],
  )

  // Gerar PDF organizado
  const generateOrganizedPDF = useCallback(async () => {
    if (pages.length === 0) return

    setGenerationStep("generating")
    setIsGenerating(true)

    try {
      const finalDoc = await PDFDocument.create()

      for (const page of pages) {
        const [docIndex, pageIndex] = page.id.split("-").map(Number)
        const pdf = loadedPDFs[docIndex]

        if (pdf) {
          try {
            const arrayBuffer = await pdf.file.arrayBuffer()
            const sourceDoc = await PDFDocument.load(arrayBuffer)
            const [copiedPage] = await finalDoc.copyPages(sourceDoc, [pageIndex])

            if (page.rotation > 0) {
              copiedPage.setRotation({ angle: page.rotation, type: "degrees" })
            }

            finalDoc.addPage(copiedPage)
          } catch (error) {
            console.error(`Erro ao processar página ${page.pageNumber}:`, error)
          }
        }
      }

      const pdfBytes = await finalDoc.save()
      const blob = new Blob([pdfBytes], { type: "application/pdf" })
      saveAs(blob, `${fileName}.pdf`)

      setGenerationStep("success")

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

            if (page.rotation > 0) {
              copiedPage.setRotation({ angle: page.rotation, type: "degrees" })
            }

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

  // Efeito para redesenhar anotações
  useEffect(() => {
    pages.forEach((_, index) => {
      drawAnnotations(index)
    })
  }, [drawAnnotations, pages])

  // Renderizar interface baseada no modo
  if (pages.length === 0) {
    return (
      <TooltipProvider>
        <div className="h-screen bg-background flex flex-col">
          {/* Header simples para upload */}
          <div className="border-b p-4">
            <div className="flex items-center justify-center"></div>
          </div>

          {/* Área de drop */}
          <div className="flex-1 flex items-center justify-center">
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              ref={fileInputRef}
              className="hidden"
            />
            <div
              className={`text-center text-gray-500 p-8 border-2 border-dashed border-gray-300 rounded-lg max-w-md cursor-pointer transition-all ${
                isDragOver ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleEmptyAreaDragOver}
              onDragLeave={handleEmptyAreaDragLeave}
              onDrop={handleEmptyAreaDrop}
            >
              <Upload
                className={`w-16 h-16 mx-auto mb-4 transition-all ${
                  isDragOver ? "text-blue-500 scale-110" : "opacity-50"
                }`}
              />
              <h3 className="text-lg font-medium mb-2">{isDragOver ? "Solte os arquivos aqui" : "Nenhum documento"}</h3>
              <p className="text-sm">
                {isDragOver
                  ? "Solte os arquivos PDF para carregar"
                  : "Clique aqui ou arraste arquivos PDF para começar"}
              </p>
            </div>
          </div>

          {/* Modal de Loading */}
          <Dialog open={loadingModal} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-md" hideCloseButton>
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-blue-400 rounded-full animate-spin animation-delay-150"></div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Processando arquivos</h3>
                  <p className="text-gray-600 animate-pulse">{loadingMessage}</p>
                </div>
                <div className="mt-6 w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: "60%" }}></div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className={`h-screen flex flex-col ${isDarkMode ? "bg-gray-900" : "bg-gray-100"}`}>
        {/* Header Unificado - Estilo Edge */}
        <div
          className={`${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-b px-4 py-2`}
        >
          <div className="flex items-center justify-between">
            {/* Lado esquerdo - Navegação */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setViewMode(viewMode === "organize" ? "view" : "organize")}
                className={isDarkMode ? "text-white hover:text-gray-200" : "text-black hover:text-gray-700"}
                title={viewMode === "organize" ? "Alternar para modo visualização" : "Alternar para modo organização"}
              >
                {viewMode === "organize" ? <Eye className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
              </Button>

              <Separator orientation="vertical" className="h-6" />

              {viewMode === "view" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={prevPage}
                    disabled={currentPageIndex === 0}
                    title="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={currentPageIndex + 1}
                      onChange={(e) => goToPage(Number.parseInt(e.target.value) || 1)}
                      className="w-16 h-8 text-center text-sm"
                      min={1}
                      max={pages.length}
                    />
                    <span className="text-sm text-gray-600">de {pages.length}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={nextPage}
                    disabled={currentPageIndex === pages.length - 1}
                    title="Próxima página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6" />

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSearch(!showSearch)}
                    title="Buscar no documento"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </>
              )}

              {viewMode === "organize" && (
                <>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleAddPages}
                    ref={addPagesInputRef}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addPagesInputRef.current?.click()}
                    disabled={isLoading}
                    title="Adicionar novo arquivo"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Centro - Ferramentas */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllPages}
                disabled={pages.length === 0}
                className={
                  isDarkMode
                    ? "text-white border-gray-600 hover:bg-gray-700"
                    : "text-black border-gray-300 hover:bg-gray-100"
                }
                title="Selecionar todas as páginas"
              >
                <CheckSquare className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={deselectAllPages}
                disabled={selectedPages.length === 0}
                className={
                  isDarkMode
                    ? "text-white border-gray-600 hover:bg-gray-700"
                    : "text-black border-gray-300 hover:bg-gray-100"
                }
                title="Desmarcar todas as páginas"
              >
                <Square className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={deleteSelectedPages}
                disabled={selectedPages.length === 0}
                title="Excluir páginas selecionadas"
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  selectedPages.forEach((pageId) => rotatePage(pageId))
                }}
                disabled={selectedPages.length === 0}
                className={
                  isDarkMode
                    ? "text-white border-gray-600 hover:bg-gray-700"
                    : "text-black border-gray-300 hover:bg-gray-100"
                }
                title="Rotacionar páginas selecionadas"
              >
                <RotateCw className="w-4 h-4" />
              </Button>

              {viewMode === "view" && (
                <>
                  <Separator orientation="vertical" className="h-6 mx-2" />

                  <Button
                    size="sm"
                    variant={showAnnotationToolbar ? "default" : "ghost"}
                    onClick={() => setShowAnnotationToolbar(!showAnnotationToolbar)}
                    className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                    title="Ferramentas de anotação"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>

                  {showAnnotationToolbar && (
                    <>
                      <Button
                        size="sm"
                        variant={currentTool === "select" ? "default" : "ghost"}
                        onClick={() => setCurrentTool("select")}
                        className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                        title="Ferramenta de seleção"
                      >
                        <Move className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant={currentTool === "highlight" ? "default" : "ghost"}
                        onClick={() => setCurrentTool("highlight")}
                        className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                        title="Marcador"
                      >
                        <Highlighter className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant={currentTool === "draw" ? "default" : "ghost"}
                        onClick={() => setCurrentTool("draw")}
                        className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                        title="Desenhar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant={currentTool === "text" ? "default" : "ghost"}
                        onClick={() => setCurrentTool("text")}
                        className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                        title="Adicionar texto"
                      >
                        <Type className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant={currentTool === "erase" ? "default" : "ghost"}
                        onClick={() => setCurrentTool("erase")}
                        className={isDarkMode ? "text-white hover:bg-gray-700" : "text-black hover:bg-gray-100"}
                        title="Apagar"
                      >
                        <Eraser className="w-4 h-4" />
                      </Button>

                      <Separator orientation="vertical" className="h-6 mx-2" />

                      {/* Cores */}
                      <div className="flex items-center gap-1">
                        {(currentTool === "highlight" ? highlightColors : drawColors).map((color) => (
                          <button
                            key={color.name}
                            className={`w-6 h-6 rounded border-2 ${
                              currentColor.value === color.value ? "border-gray-800" : "border-gray-300"
                            }`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => setCurrentColor(color)}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Lado direito - Controles */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsDarkMode(!isDarkMode)}
                title={isDarkMode ? "Modo claro" : "Modo escuro"}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>

              <Separator orientation="vertical" className="h-6" />

              {viewMode === "view" && (
                <>
                  <Button size="sm" variant="ghost" onClick={zoomOut} title="Diminuir zoom">
                    <ZoomOut className="w-4 h-4" />
                  </Button>

                  <span className="text-sm font-medium min-w-[50px] text-center">{Math.round(scale * 100)}%</span>

                  <Button size="sm" variant="ghost" onClick={zoomIn} title="Aumentar zoom">
                    <ZoomIn className="w-4 h-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6" />
                </>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSaveDialog(true)}
                disabled={isGenerating}
                title="Salvar PDF"
              >
                <Download className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowZipDialog(true)}
                disabled={isGenerating}
                title="Salvar páginas separadamente"
              >
                <Archive className="w-4 h-4" />
              </Button>

              <Button size="sm" variant="ghost" onClick={clearPage} title="Limpar todos os dados">
                <Broom className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Barra de busca */}
          {showSearch && viewMode === "view" && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                placeholder="Buscar no documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              <Button size="sm" variant="outline">
                Buscar
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Área principal */}
          <div className="flex-1 overflow-auto" ref={viewerRef} onWheel={handleWheel}>
            {viewMode === "organize" ? (
              // Modo organização (grid)
              <div className="p-4">
                <div className="grid grid-cols-6 gap-4">
                  {pages.map((page, index) => {
                    const pdf = loadedPDFs[page.documentIndex]
                    if (!pdf) return null

                    return (
                      <div key={page.id} className="relative">
                        <div
                          className={`border-2 rounded-lg overflow-hidden cursor-move transition-all duration-200 ${
                            page.selected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                          }`}
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
                            {page.rotation > 0 && <div className="text-xs text-blue-600">{page.rotation}°</div>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              // Modo visualização contínua (estilo Edge)
              <div className="flex justify-center py-8">
                <div className="space-y-8">
                  {pages.map((page, index) => {
                    const pdf = loadedPDFs[page.documentIndex]
                    if (!pdf) return null

                    return (
                      <div
                        key={page.id}
                        className={`relative shadow-lg ${
                          currentPageIndex === index ? "ring-2 ring-blue-500" : ""
                        } transition-all duration-200`}
                        style={{ transform: `scale(${scale})`, transformOrigin: "center top" }}
                      >
                        <div className="relative bg-white">
                          <Document file={pdf.file}>
                            <Page
                              pageNumber={page.originalIndex + 1}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              onLoadSuccess={() => {
                                const canvas = canvasRefs.current.get(index)
                                if (canvas) {
                                  const container = canvas.parentElement
                                  if (container) {
                                    const rect = container.getBoundingClientRect()
                                    canvas.width = rect.width
                                    canvas.height = rect.height
                                    drawAnnotations(index)
                                  }
                                }
                              }}
                              style={{
                                transform: `rotate(${page.rotation}deg)`,
                                transformOrigin: "center center",
                              }}
                            />
                          </Document>

                          {/* Canvas para anotações */}
                          <canvas
                            ref={(canvas) => {
                              if (canvas) {
                                canvasRefs.current.set(index, canvas)
                              }
                            }}
                            className="absolute inset-0 pointer-events-auto"
                            onMouseDown={(e) => handleMouseDown(e, index)}
                            onMouseMove={handleMouseMove}
                            onMouseUp={() => handleMouseUp(index)}
                            onMouseLeave={() => handleMouseUp(index)}
                            style={{
                              cursor:
                                currentTool === "select"
                                  ? "default"
                                  : currentTool === "text"
                                    ? "text"
                                    : currentTool === "erase"
                                      ? "crosshair"
                                      : "crosshair",
                            }}
                          />

                          {/* Número da página */}
                          <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                            {page.pageNumber}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className={`${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-t p-2`}>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{pages.length} páginas</span>
            {selectedPages.length > 0 && viewMode === "organize" && <span>{selectedPages.length} selecionadas</span>}
            {viewMode === "view" && (
              <span>
                Página {currentPageIndex + 1} de {pages.length}
              </span>
            )}
          </div>
        </div>

        {/* Modais */}
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

        <Dialog open={loadingModal} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" hideCloseButton>
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative mb-6">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-blue-400 rounded-full animate-spin animation-delay-150"></div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Processando arquivos</h3>
                <p className="text-gray-600 animate-pulse">{loadingMessage}</p>
              </div>
              <div className="mt-6 w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: "60%" }}></div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
