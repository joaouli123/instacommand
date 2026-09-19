"use client"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ImagePlus, Hash, Calendar as CalendarIcon, Send } from "lucide-react"
import { useDropzone } from "react-dropzone"

export default function ComposerPage() {
  const [caption, setCaption] = useState("")

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [], 'video/*': [] }
  })

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] animate-fade-in">
      {/* Editor Panel */}
      <Card className="flex-1 flex flex-col p-6 overflow-y-auto">
        <h2 className="text-xl font-semibold text-white mb-6">Novo Post</h2>
        
        <div className="space-y-6">
          {/* Media Upload */}
          <div>
            <label className="text-sm font-medium text-text mb-2 block">Mídia</label>
            <div 
              {...getRootProps()} 
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surface transition-colors bg-background"
            >
              <input {...getInputProps()} />
              <ImagePlus className="w-10 h-10 text-muted mb-4" />
              <p className="text-sm font-medium text-text">Arraste e solte imagens ou vídeos aqui</p>
              <p className="text-xs text-muted mt-1">Ou clique para selecionar (JPG, PNG, MP4)</p>
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-text block">Legenda</label>
              <span className="text-xs text-muted">{caption.length}/2200</span>
            </div>
            <textarea 
              className="w-full h-32 rounded-md border border-border bg-surface p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Escreva algo incrível..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2200}
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-sm font-medium text-text mb-2 block">Hashtags</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-2.5 w-4 h-4 text-muted" />
                <Input className="pl-9" placeholder="Adicionar hashtag..." />
              </div>
              <Button variant="secondary">Adicionar</Button>
            </div>
          </div>

          {/* Scheduling */}
          <div className="pt-4 border-t border-border flex gap-4">
            <Button variant="outline" className="flex-1 gap-2">
              <CalendarIcon size={18} />
              Agendar
            </Button>
            <Button className="flex-1 gap-2">
              <Send size={18} />
              Publicar Agora
            </Button>
          </div>
        </div>
      </Card>

      {/* Preview Panel */}
      <Card className="w-full lg:w-[400px] p-6 flex flex-col items-center bg-surface/50">
        <h3 className="text-sm font-medium text-muted mb-6 w-full">Pré-visualização</h3>
        
        <div className="w-[320px] bg-card border border-border rounded-[2rem] overflow-hidden shadow-xl">
          {/* Mock Instagram Header */}
          <div className="p-3 flex items-center gap-2 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400" />
            <span className="text-sm font-semibold text-white">minha_empresa</span>
          </div>
          {/* Mock Media */}
          <div className="w-full aspect-square bg-surface flex items-center justify-center">
            <span className="text-muted text-sm">Preview da Mídia</span>
          </div>
          {/* Mock Footer */}
          <div className="p-3">
            <div className="flex gap-3 mb-2">
              <div className="w-6 h-6 rounded-full border-2 border-muted" />
              <div className="w-6 h-6 rounded-full border-2 border-muted" />
              <div className="w-6 h-6 rounded-full border-2 border-muted" />
            </div>
            <p className="text-sm text-text">
              <span className="font-semibold text-white mr-2">minha_empresa</span>
              {caption || 'A legenda aparecerá aqui...'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
