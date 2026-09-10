import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Share2, Copy, Check, Mail, QrCode, MessageSquareText } from 'lucide-react'
import QRCodeSVG from 'react-qr-code'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  venueOutreachMessage,
  shareVenueOutreach,
  whatsappOutreachUrl,
  mailtoOutreachUrl,
  venuesLandingUrl,
} from '@/lib/venueOutreach'

/**
 * "Ask them" — the sheet behind the acquisition prompt on Courts.
 *
 * UAT: *"the same happens when you click on Ask them - what does this do and
 * would it show a qr code or a pop up with a ready made message to forward to
 * the venue."*
 *
 * The honest answer to "what does this do" was: nothing the venue name didn't
 * already do. It called `navigate('/venues/:id')`, the same handler as the row
 * beside it. The fix is not a better destination — it is to make the control do
 * the thing it says.
 *
 * Fix class: root-cause. Pointing the button at a different page would have been
 * the patch; the defect was a control whose label described an action it never
 * performed.
 *
 * The message is shown in full before anything is sent. A player is about to
 * put their own name on a message to their own club, and a share sheet that
 * fires with unseen text is how you get someone to never press it twice.
 */

export interface AskVenueSheetProps {
  open: boolean
  onClose: () => void
  venueName: string
  city?: string | null
  /** The venue's own address, when we hold one — enables the mail row. */
  email?: string | null
}

export function AskVenueSheet({ open, onClose, venueName, city, email }: AskVenueSheetProps) {
  const { profile } = useAuth()
  const [copied, setCopied] = useState(false)
  /**
   * Two modes, because there are two moments. Away from the club you forward a
   * message; standing at the desk you hold up a code and let them scan it. The
   * message is the default — the player who has just noticed their club is
   * missing is usually not at the club — but the desk moment is real and the
   * switch belongs here rather than in a second entry point.
   */
  const [mode, setMode] = useState<'message' | 'qr'>('message')

  const ctx = { venueName, playerName: profile?.name ?? null, city: city ?? null }
  const message = venueOutreachMessage(ctx)

  // `copied` is a transient confirmation, not sheet state: it clears itself
  // after a couple of seconds rather than being reset when the sheet opens.
  // A tick that stays lit forever stops meaning "that worked just now".
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2200)
    return () => clearTimeout(t)
  }, [copied])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  async function onShare() {
    const result = await shareVenueOutreach(ctx)
    if (result === 'shared') { onClose(); return }
    if (result === 'copied') {
      setCopied(true)
      toast.success('Message copied — paste it to the venue')
      return
    }
    if (result === 'unavailable') {
      toast.error('Could not open share — select the text and copy it')
    }
    // 'cancelled' — they backed out of their own share sheet. Say nothing.
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy — select the text instead')
    }
  }

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Ask ${venueName} to join Padel Players`}
            className="fixed bottom-0 left-0 right-0 z-[60] max-h-[92vh] overflow-y-auto rounded-t-[26px] bg-surface"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose()
            }}
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pt-2.5">
              <div className="-mt-2.5 flex cursor-grab justify-center py-2.5 active:cursor-grabbing">
                <div className="h-1 w-10 rounded-pill bg-[#D7DDD9]" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.01em] text-ink">
                    Ask {venueName}
                  </h2>
                  <p className="text-[14px] leading-[19px] text-ink-2">
                    {mode === 'message'
                      ? "Send them this and we'll take it from there"
                      : 'Hold this up at the desk for them to scan'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-hairline"
                >
                  <X className="h-4 w-4 text-ink-2" />
                </button>
              </div>

              {/* Mode switch. Two tabs rather than a second sheet: it is the
                  same ask, delivered by hand or by phone. */}
              <div
                role="tablist"
                aria-label="How to ask"
                className="flex gap-1 rounded-card border border-hairline bg-card p-1"
              >
                {([
                  { key: 'message' as const, label: 'Message', Icon: MessageSquareText },
                  { key: 'qr' as const,      label: 'QR code',  Icon: QrCode },
                ]).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={mode === key}
                    onClick={() => setMode(key)}
                    className={
                      mode === key
                        ? 'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-control bg-court text-[13px] font-bold text-white'
                        : 'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-control text-[13px] font-semibold text-ink-2'
                    }
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'message' ? (
                <>
                  {/* The message, in full, before anything is sent. */}
                  <div className="rounded-panel border border-hairline bg-card p-4">
                    <p className="whitespace-pre-wrap text-[14px] leading-[20px] text-ink">{message}</p>
                  </div>

                  <button
                    onClick={onShare}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-card bg-court py-3.5 text-[15px] font-bold leading-[18px] text-white transition-transform active:scale-[0.99]"
                  >
                    <Share2 className="h-[18px] w-[18px]" strokeWidth={2.3} />
                    Send to the venue
                  </button>

                  <div className="flex gap-2">
                    <a
                      href={whatsappOutreachUrl(ctx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onClose}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-card border border-hairline bg-card text-[13px] font-bold text-ink"
                    >
                      WhatsApp
                    </a>
                    <a
                      href={mailtoOutreachUrl(ctx, email)}
                      onClick={onClose}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-card border border-hairline bg-card text-[13px] font-bold text-ink"
                    >
                      <Mail className="h-4 w-4" strokeWidth={2.2} />
                      Email
                    </a>
                    <button
                      onClick={onCopy}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-card border border-hairline bg-card text-[13px] font-bold text-ink"
                    >
                      {copied
                        ? <Check className="h-4 w-4 text-court" strokeWidth={2.4} />
                        : <Copy className="h-4 w-4" strokeWidth={2.2} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <p className="pb-1 text-center text-[12px] leading-[16px] text-ink-3">
                    Nothing is sent until you send it. It goes from you, not from us.
                  </p>
                </>
              ) : (
                <>
                  {/* White ground and a wide quiet zone regardless of theme —
                      a scanner needs the contrast, and `surface` is warm enough
                      to cost reads on a dim phone at a desk. */}
                  <div className="flex flex-col items-center gap-3 rounded-panel border border-hairline bg-white p-5">
                    <QRCodeSVG
                      value={venuesLandingUrl()}
                      size={196}
                      level="M"
                      bgColor="#FFFFFF"
                      fgColor="#0B1512"
                      style={{ height: 196, width: 196 }}
                    />
                    <p className="num text-center text-[12px] leading-4 text-ink-2 break-all">
                      {venuesLandingUrl()}
                    </p>
                  </div>

                  <p className="text-center text-[13px] leading-[18px] text-ink-2">
                    Turn your screen brightness up and let them scan it with their
                    phone camera. It opens the page for venues.
                  </p>

                  <button
                    onClick={() => setMode('message')}
                    className="min-h-[44px] pb-1 text-center text-[13px] font-semibold text-ink-2 underline underline-offset-2"
                  >
                    Not at the club? Send the message instead
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(sheet, document.body)
}

export default AskVenueSheet
