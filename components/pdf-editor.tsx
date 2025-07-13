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
} from "lucide-react"

// Configurar worker do PDF.js apenas no cliente
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.js`
}

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

interface PDFEditorProps {
  loadedPDFs: LoadedPDF[]
  setLoadedPDFs: React.Dispatch<React.SetStateAction<LoadedPDF[]>>
  pages: PDFPage[]
  setPages: React.Dispatch<React.SetStateAction<PDFPage[]>>
  selectedPages: string[]
  setSelectedPages: React.Dispatch<React.SetStateAction<string[]>>
  viewMode: "list" | "blocks"
  setViewMode: React.Dispatch<React.SetStateAction<"list" | "blocks">>
  draggedPage: string | null
  setDraggedPage: React.Dispatch<React.SetStateAction<string | null>>
  dragOverIndex: number | null
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>
  fileName: string
  setFileName: React.Dispatch<React.SetStateAction<string>>
  zipFileName: string
  setZipFileName: React.Dispatch<React.SetStateAction<string>>
  isGenerating: boolean
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  showSaveDialog: boolean
  setShowSaveDialog: React.Dispatch<React.SetStateAction<boolean>>
  showZipDialog: boolean
  setShowZipDialog: React.Dispatch<React.SetStateAction<boolean>>
  showPreview: boolean
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>
  generationStep: "generating" | "success" | null
  setGenerationStep: React.Dispatch<React.SetStateAction<"generating" | "success" | null>>
  isDragOver: boolean
  setIsDragOver: React.Dispatch<React.SetStateAction<boolean>>
  fileInputRef: React.RefObject<HTMLInputElement>
  addPagesInputRef: React.RefObject<HTMLInputElement>
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleAddPages: (event: React.ChangeEvent<HTMLInputElement>) => void
  handlePageSelection: (pageId: string, selected: boolean) => void
  selectAllPages: () => void
  deselectAllPages: () => void
  deleteSelectedPages: () => void
  handleDragStart: (pageId: string) => void
  handleDragOver: (event: React.DragEvent, index: number) => void
  handleDragLeave: () => void
  handleDrop: (event: React.DragEvent, targetIndex: number) => void
  generateOrganizedPDF: () => void
  generateSeparatePages: () => void
  clearPage: () => void
  handleEmptyAreaDragOver: (event: React.DragEvent) => void
  handleEmptyAreaDragLeave: (event: React.DragEvent) => void
  handleEmptyAreaDrop: (event: React.DragEvent) => void
}

const PageThumbnail = ({ page, pdf, scale = 0.2 }: { page: PDFPage; pdf: LoadedPDF; scale?: number }) => {
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Verificar se estamos no cliente antes de renderizar
  if (typeof window === "undefined") {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded p-4 min-h-[100px]">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative">
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
      <div className="flex flex-col items-center gap-6 p-8">
        {pages.map((page) => {
          const pdf = loadedPDFs[page.documentIndex]
          if (!pdf) return null

          return (
            <div key={page.id} className="shadow-lg border rounded-lg overflow-hidden">
              <Document file={pdf.file} key={`preview-full-${page.id}`}>
                <Page
                  pageNumber={page.originalIndex + 1}
                  scale={1.2}
                  className="pointer-events-none"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
              <div className="p-2 bg-gray-50 text-center text-sm text-gray-600">
                Página {page.pageNumber} - {page.fileName}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

export default function PDFEditor({
  loadedPDFs,
  setLoadedPDFs,
  pages,
  setPages,
  selectedPages,
  setSelectedPages,
  viewMode,
  setViewMode,
  draggedPage,
  setDraggedPage,
  dragOverIndex,
  setDragOverIndex,
  fileName,
  setFileName,
  zipFileName,
  setZipFileName,
  isGenerating,
  setIsGenerating,
  isLoading,
  setIsLoading,
  showSaveDialog,
  setShowSaveDialog,
  showZipDialog,
  setShowZipDialog,
  showPreview,
  setShowPreview,
  generationStep,
  setGenerationStep,
  isDragOver,
  setIsDragOver,
  fileInputRef,
  addPagesInputRef,
  handleFileUpload,
  handleAddPages,
  handlePageSelection,
  selectAllPages,
  deselectAllPages,
  deleteSelectedPages,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  generateOrganizedPDF,
  generateSeparatePages,
  clearPage,
  handleEmptyAreaDragOver,
  handleEmptyAreaDragLeave,
  handleEmptyAreaDrop,
}: PDFEditorProps) {
  const [isClient, setIsClient] = useState(false)

  // Verificar se estamos no cliente
  useEffect(() => {
    setIsClient(true)
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
      <div className="h-screen bg-background flex flex-col">
        {/* Header Minimalista */}
        <div className="border-b p-4">
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
        <div className="flex-1 p-4">
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
                <div className="grid grid-cols-6 gap-4">
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
                        >
                          {/* Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <Checkbox
                              checked={page.selected}
                              onCheckedChange={(checked) => handlePageSelection(page.id, checked as boolean)}
                              className="bg-white shadow-sm"
                            />
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
                <div className="space-y-2">
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

                          <div className="w-16 h-20 border rounded overflow-hidden mr-3 flex-shrink-0">
                            <PageThumbnail page={page} pdf={pdf} scale={0.15} />
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
          <div className="border-t p-3 bg-gray-50">
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