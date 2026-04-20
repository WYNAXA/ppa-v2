import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Globe, Lock, Link } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type Visibility = 'public' | 'private' | 'invite_only'

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; desc: string; Icon: typeof Globe }> = [
  { value: 'public',      label: 'Public',       desc: 'Anyone can find and join',       Icon: Globe },
  { value: 'private',     label: 'Private',       desc: 'Admin approves join requests',   Icon: Lock  },
  { value: 'invite_only', label: 'Invite only',   desc: 'Members join via invite link',   Icon: Link  },
]

interface CreateGroupSheetProps {
  open: boolean
  onClose: () => void
}

export function CreateGroupSheet({ open, onClose }: CreateGroupSheetProps) {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity]               = useState('')
  const [visibility, setVisibility]   = useState<Visibility>('public')

  function reset() {
    setName('')
    setDescription('')
    setCity('')
    setVisibility('public')
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      // 1. Create the group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name:        name.trim(),
          description: description.trim() || null,
          city:        city.trim() || null,
          visibility,
          admin_id:    user.id,
        })
        .select('id')
        .single()

      if (groupError) throw groupError

      // 2. Add creator as approved admin member
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id:  user.id,
          role:     'admin',
          status:   'approved',
        })

      if (memberError) throw memberError
      return group
    },
    onSuccess: (group) => {
      reset()
      onClose()
      navigate(`/community/groups/${group.id}`)
    },
  })

  const canSubmit = name.trim().length > 0

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <button
                onClick={onClose}
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Create Group</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto space-y-4 pb-2"
              style={{ maxHeight: '80vh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
            >
              {/* Name */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Group name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dublin Padel Crew"
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's your group about?"
                  rows={2}
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  City <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Dublin"
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-2">
                  Visibility
                </label>
                <div className="space-y-2">
                  {VISIBILITY_OPTIONS.map(({ value, label, desc, Icon }) => {
                    const selected = visibility === value
                    return (
                      <button
                        key={value}
                        onClick={() => setVisibility(value)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                          selected ? 'border-teal-500 bg-teal-50/50' : 'border-gray-100 hover:border-gray-200'
                        )}
                      >
                        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', selected ? 'bg-teal-100' : 'bg-gray-100')}>
                          <Icon className={cn('h-4 w-4', selected ? 'text-teal-600' : 'text-gray-400')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[13px] font-semibold', selected ? 'text-teal-700' : 'text-gray-800')}>{label}</p>
                          <p className="text-[11px] text-gray-400">{desc}</p>
                        </div>
                        <div className={cn('h-4 w-4 rounded-full border-2 flex-shrink-0', selected ? 'border-teal-500 bg-teal-500' : 'border-gray-300')} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {createMutation.isError && (
                <p className="text-[12px] text-red-500 text-center">Failed to create group. Try again.</p>
              )}

              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
