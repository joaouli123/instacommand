"use client"

// TikTok options exactly as TikTok's Direct Post guidelines require: the creator's info read
// every time this opens, privacy picked by the user from the creator's options (no default),
// interactions unchecked by default and greyed out when the creator turned them off,
// commercial content disclosure and the Music Usage Confirmation consent.
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Info, Loader2 } from "lucide-react"
import { SiTiktok } from "@icons-pack/react-simple-icons"
import { fetchApi } from "@/lib/api"
import { tr, useT } from "@/lib/i18n"
import type { MediaItem } from "@/components/preview/SocialPostPreview"

export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY"
export type TikTokSettings = {
  privacyLevel: TikTokPrivacy | null
  allowComment: boolean
  allowDuet: boolean
  allowStitch: boolean
  commercialContent: boolean
  yourBrand: boolean
  brandedContent: boolean
  aiGenerated: boolean
  consent: boolean
}
export type TikTokCreatorInfo = { nickname: string; username: string | null; avatarUrl: string | null; privacyLevelOptions: TikTokPrivacy[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxVideoPostDurationSec: number | null; canPost: boolean }

export const emptyTikTokSettings = (): TikTokSettings => ({ privacyLevel: null, allowComment: false, allowDuet: false, allowStitch: false, commercialContent: false, yourBrand: false, brandedContent: false, aiGenerated: false, consent: false })

export const TIKTOK_PRIVACY_LABELS: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: "Todos", MUTUAL_FOLLOW_FRIENDS: "Amigos (seguidores mútuos)", FOLLOWER_OF_CREATOR: "Seguidores", SELF_ONLY: "Só eu",
}
const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
const BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en"

export function useTikTokCreatorInfo(accountId?: string) {
  // TikTok asks for fresh creator info every time the posting screen renders: no cache.
  return useQuery<TikTokCreatorInfo>({ queryKey: ["tiktok-creator-info", accountId], enabled: !!accountId, staleTime: 0, gcTime: 0, retry: false, refetchOnMount: "always",
    queryFn: ({ signal }) => fetchApi(`/accounts/tiktok/${encodeURIComponent(accountId!)}/creator-info`, { signal }) as Promise<TikTokCreatorInfo> })
}

/** What still blocks publishing to TikTok, or null when ready. Shared with the composer's checks. */
export function tiktokProblem(settings: TikTokSettings, creator: TikTokCreatorInfo | undefined, media: MediaItem | null) {
  if (!creator) return tr("Aguarde as informações do perfil do TikTok carregarem.")
  if (!creator.canPost) return tr("O TikTok não permite novas publicações deste perfil agora. Tente mais tarde.")
  if (media?.kind === "video" && media.duration && creator.maxVideoPostDurationSec && media.duration > creator.maxVideoPostDurationSec) return tr("Este perfil do TikTok aceita vídeos de até {duration}. Corte o vídeo ou desmarque o TikTok.", { duration: `${Math.floor(creator.maxVideoPostDurationSec / 60)} min${creator.maxVideoPostDurationSec % 60 ? ` ${creator.maxVideoPostDurationSec % 60} s` : ""}` })
  if (!settings.privacyLevel) return tr("Escolha quem pode ver o vídeo no TikTok.")
  if (!creator.privacyLevelOptions.includes(settings.privacyLevel)) return tr("A privacidade escolhida não está disponível para este perfil do TikTok.")
  if (settings.commercialContent && !settings.yourBrand && !settings.brandedContent) return tr("Na divulgação comercial do TikTok, marque \"Sua marca\", \"Conteúdo de marca\" ou os dois.")
  if (settings.brandedContent && settings.privacyLevel === "SELF_ONLY") return tr("Conteúdo de marca não pode ser \"Só eu\" no TikTok. Escolha outra privacidade.")
  if (!settings.consent) return tr("Confirme a Declaração de Uso de Música do TikTok.")
  return null
}

function Check({ checked, disabled, onChange, label, help }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; label: string; help?: string }) {
  return <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60" : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"}`} title={help}>
    <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
    <span><span className="block text-xs font-semibold text-slate-800">{label}</span>{help && <span className="block text-[11px] leading-4 text-slate-500">{help}</span>}</span>
  </label>
}

export function TikTokOptions({ accountId, settings, onChange, media }: { accountId?: string; settings: TikTokSettings; onChange: (update: (current: TikTokSettings) => TikTokSettings) => void; media: MediaItem | null }) {
  const t = useT()
  const query = useTikTokCreatorInfo(accountId)
  const creator = query.data
  const set = <K extends keyof TikTokSettings>(key: K, value: TikTokSettings[K]) => onChange(current => ({ ...current, [key]: value }))
  const label = !settings.commercialContent ? null : settings.brandedContent ? t("Parceria paga") : settings.yourBrand ? t("Conteúdo promocional") : null
  const tooLong = media?.kind === "video" && media.duration && creator?.maxVideoPostDurationSec ? media.duration > creator.maxVideoPostDurationSec : false

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 md:p-5" aria-labelledby="tiktok-options-heading">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black"><SiTiktok size={20} color="#fff" title="TikTok" /></span>
      <div className="min-w-0"><h3 id="tiktok-options-heading" className="text-sm font-semibold text-slate-800">{t("Publicação no TikTok")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("O texto do post vira a legenda do TikTok (até 2.200 caracteres, hashtags e @menções funcionam).")}</p></div>
    </div>

    {!accountId ? <p className="text-xs text-slate-500">{t("Conecte o perfil do TikTok desta empresa em Contas.")}</p>
      : query.isLoading ? <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" />{t("Consultando o perfil no TikTok…")}</div>
      : query.isError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{query.error.message} <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">{t("Tentar de novo")}</button></p>
      : creator && <>
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
          {creator.avatarUrl ? <img src={creator.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{creator.nickname[0]?.toUpperCase()}</span>}
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{t("Publicar como {name}", { name: creator.nickname })}</span>{creator.username && <span className="block text-[11px] text-slate-500">@{creator.username}</span>}</span>
        </div>
        {!creator.canPost && <p role="alert" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t("O TikTok não permite novas publicações deste perfil agora. Tente mais tarde.")}</p>}
        {tooLong && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{t("Este perfil aceita vídeos de até {count} minutos no TikTok. Corte o vídeo ou desmarque o TikTok.", { count: Math.round((creator.maxVideoPostDurationSec || 0) / 60) })}</p>}

        <label className="block text-xs font-medium text-slate-700">{t("Quem pode ver este vídeo")} <span className="text-rose-600">*</span>
          <select value={settings.privacyLevel || ""} onChange={(event) => set("privacyLevel", (event.target.value || null) as TikTokPrivacy | null)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" aria-label={t("Privacidade no TikTok")}>
            <option value="" disabled>{t("Selecione")}</option>
            {creator.privacyLevelOptions.map((option) => {
              const blocked = option === "SELF_ONLY" && settings.brandedContent
              return <option key={option} value={option} disabled={blocked} title={blocked ? t("Conteúdo de marca não pode ser privado.") : undefined}>{t(TIKTOK_PRIVACY_LABELS[option])}{blocked ? t(" (indisponível com conteúdo de marca)") : ""}</option>
            })}
          </select>
          {creator.privacyLevelOptions.length === 1 && creator.privacyLevelOptions[0] === "SELF_ONLY" && <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">{t("Enquanto o app não passa pela auditoria do TikTok, só dá para publicar como \"Só eu\" e com o perfil do TikTok em modo privado.")}</span>}
        </label>

        <fieldset>
          <legend className="text-xs font-medium text-slate-700">{t("Permitir que outras pessoas")}</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            <Check checked={settings.allowComment} disabled={creator.commentDisabled} onChange={(value) => set("allowComment", value)} label={t("Comentem")} help={creator.commentDisabled ? t("Desativado nas configurações do seu TikTok.") : undefined} />
            <Check checked={settings.allowDuet} disabled={creator.duetDisabled} onChange={(value) => set("allowDuet", value)} label={t("Façam Dueto")} help={creator.duetDisabled ? t("Desativado nas configurações do seu TikTok.") : undefined} />
            <Check checked={settings.allowStitch} disabled={creator.stitchDisabled} onChange={(value) => set("allowStitch", value)} label={t("Façam Costura")} help={creator.stitchDisabled ? t("Desativado nas configurações do seu TikTok.") : undefined} />
          </div>
        </fieldset>

        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex cursor-pointer items-start justify-between gap-4" title={settings.commercialContent && !settings.yourBrand && !settings.brandedContent ? t("Indique se o conteúdo promove você, um terceiro ou os dois.") : undefined}>
            <span><span className="block text-xs font-semibold text-slate-800">{t("Divulgar conteúdo comercial")}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{t("Ative se o vídeo promove você, sua marca, um produto ou um serviço.")}</span></span>
            <input type="checkbox" role="switch" checked={settings.commercialContent} onChange={(event) => onChange(current => ({ ...current, commercialContent: event.target.checked, ...(event.target.checked ? {} : { yourBrand: false, brandedContent: false }) }))} className="mt-0.5 h-4 w-4 accent-indigo-600" aria-label={t("Divulgar conteúdo comercial")} />
          </label>
          {settings.commercialContent && <div className="space-y-2 border-t border-slate-100 pt-2">
            <Check checked={settings.yourBrand} onChange={(value) => set("yourBrand", value)} label={t("Sua marca")} help={t("Você promove você mesmo ou o seu próprio negócio.")} />
            <Check checked={settings.brandedContent} disabled={settings.privacyLevel === "SELF_ONLY"} onChange={(value) => set("brandedContent", value)} label={t("Conteúdo de marca")} help={settings.privacyLevel === "SELF_ONLY" ? t("Conteúdo de marca não pode ser privado. Escolha outra privacidade para marcar.") : t("Você promove outra marca ou um terceiro (parceria paga).")} />
            {label ? <p className="flex gap-1.5 text-[11px] text-slate-600"><Info size={13} className="mt-px shrink-0" />{t("O vídeo será identificado como \"{label}\".", { label })}</p>
              : <p className="text-[11px] text-amber-800">{t("Indique se o conteúdo promove você, um terceiro ou os dois.")}</p>}
          </div>}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3"><input type="checkbox" checked={settings.aiGenerated} onChange={(event) => set("aiGenerated", event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">{t("Conteúdo gerado por IA")}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{t("Marque se o vídeo mostra pessoas ou cenas realistas criadas ou alteradas com IA.")}</span></span></label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
          <input type="checkbox" checked={settings.consent} onChange={(event) => set("consent", event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
          <span className="text-[11px] leading-5 text-slate-700">
            {settings.commercialContent && settings.brandedContent
              ? <>{t("Ao publicar, você concorda com a")} <a href={BRANDED_URL} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">{t("Política de Conteúdo de Marca")}</a> {t("e com a")} <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">{t("Declaração de Uso de Música")}</a> {t("do TikTok.")}</>
              : <>{t("Ao publicar, você concorda com a")} <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">{t("Declaração de Uso de Música")}</a> {t("do TikTok.")}</>}
            <span className="text-rose-600"> *</span>
          </span>
        </label>
        <p className="text-[11px] leading-4 text-slate-500">{t("Depois do envio, o TikTok pode levar alguns minutos para processar o vídeo; ele pode não aparecer no perfil na hora. O status aparece no resultado da publicação.")}</p>
      </>}
  </section>
}
