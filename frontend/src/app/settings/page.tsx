"use client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SettingsPage() {
  return (
    <div className="max-w-4xl space-y-8 animate-fade-in pb-10">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Configurações</h2>
        <p className="text-muted">Gerencie suas preferências e configurações da plataforma.</p>
      </div>

      <div className="grid gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 border-b border-border pb-4">Coleta de Dados</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base text-white">Frequência de Atualização</Label>
                <p className="text-sm text-muted mt-1">Com que frequência devemos buscar novos dados do Instagram.</p>
              </div>
              <div className="w-48">
                <Select defaultValue="1h">
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15m">A cada 15 min</SelectItem>
                    <SelectItem value="1h">A cada 1 hora</SelectItem>
                    <SelectItem value="24h">Apenas diariamente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 border-b border-border pb-4">Notificações</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base text-white">Relatório Semanal</Label>
                <p className="text-sm text-muted mt-1">Receba um resumo de performance por email toda segunda-feira.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base text-white">Alertas de Engajamento</Label>
                <p className="text-sm text-muted mt-1">Seja notificado quando um post viralizar.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base text-white">Falha na Publicação</Label>
                <p className="text-sm text-muted mt-1">Alertas caso um post agendado falhe.</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-4">
          <Button variant="outline">Descartar Alterações</Button>
          <Button>Salvar Configurações</Button>
        </div>
      </div>
    </div>
  )
}
