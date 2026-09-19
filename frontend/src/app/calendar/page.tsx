"use client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

export default function CalendarPage() {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const dates = Array.from({ length: 35 }, (_, i) => i - 2) // mock calendar days

  return (
    <div className="h-full flex flex-col gap-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Setembro 2023</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon"><ChevronLeft size={20} /></Button>
            <Button variant="ghost" size="icon"><ChevronRight size={20} /></Button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary" /> Agendado</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-success" /> Publicado</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-surface border border-border" /> Rascunho</div>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="grid grid-cols-7 border-b border-border bg-surface/50">
          {days.map(day => (
            <div key={day} className="py-3 text-center text-sm font-medium text-muted">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1 auto-rows-fr">
          {dates.map((date, i) => (
            <div 
              key={i} 
              className={`border-r border-b border-border p-2 hover:bg-surface/30 cursor-pointer group relative
                ${date === 15 ? 'bg-primary/5' : ''}
              `}
            >
              <span className={`text-sm font-medium ${date === 15 ? 'text-primary' : (date > 0 && date <= 30 ? 'text-text' : 'text-muted/30')}`}>
                {date > 0 && date <= 30 ? date : ''}
              </span>
              
              {/* Mock events */}
              {date === 12 && (
                <div className="mt-2 text-xs bg-success/20 text-success px-2 py-1 rounded truncate">Post Lançamento</div>
              )}
              {date === 18 && (
                <div className="mt-2 text-xs bg-primary/20 text-primary px-2 py-1 rounded truncate">Dica #05</div>
              )}

              {/* Add button overlay */}
              {date > 0 && date <= 30 && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus size={16} className="text-muted" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
