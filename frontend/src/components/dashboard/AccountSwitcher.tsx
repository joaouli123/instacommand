"use client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AccountSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="px-3 py-1.5 rounded-md bg-surface border border-border text-sm flex items-center gap-2 cursor-pointer hover:bg-border transition-colors">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
          <span className="truncate max-w-[120px]">@minha_empresa</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="gap-3">
          <Avatar className="w-6 h-6">
            <AvatarImage src="" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
          @minha_empresa
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-3">
          <Avatar className="w-6 h-6">
            <AvatarImage src="" />
            <AvatarFallback>PO</AvatarFallback>
          </Avatar>
          @produto_oficial
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
