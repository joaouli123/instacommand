"use client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Facebook } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px]" />

      <Card className="w-full max-w-md p-8 flex flex-col items-center text-center relative z-10 glass-card">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
            InstaCommand
          </h1>
          <p className="text-muted text-sm">
            O centro de comando definitivo para o seu Instagram.
          </p>
        </div>

        <h2 className="text-xl font-semibold text-white mb-6">
          Conecte sua conta Instagram
        </h2>

        <Button 
          className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90 text-white h-12 text-base font-medium mb-6"
        >
          <Facebook className="mr-2 h-5 w-5" />
          Entrar com Facebook
        </Button>

        <p className="text-xs text-muted/80 px-4">
          O InstaCommand precisa de permissões do Facebook para acessar seus perfis e insights do Instagram. 
          Não publicaremos nada sem sua autorização.
        </p>
      </Card>
    </div>
  )
}
