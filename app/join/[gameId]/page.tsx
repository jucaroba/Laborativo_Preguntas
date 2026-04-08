'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game } from '@/types'

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [game, setGame] = useState<Game | null>(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function init() {
      const existingId = localStorage.getItem(`participant_${gameId}`)
      if (existingId) {
        const { data: participant } = await supabase
          .from('participants')
          .select('id')
          .eq('id', existingId)
          .single()
        if (participant) {
          router.replace(`/play/${gameId}`)
          return
        }
        localStorage.removeItem(`participant_${gameId}`)
      }
      const { data } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (data) setGame(data)
      setChecking(false)
    }
    init()
  }, [gameId, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Por favor ingresa tu nombre y apellido'); return }
    const parts = fullName.trim().split(/\s+/)
    const name = parts[0]
    const last_name = parts.slice(1).join(' ') || '-'
    setLoading(true)
    setError('')
    const { data, error: dbError } = await supabase
      .from('participants')
      .insert({ game_id: gameId, name, last_name, score: 0 })
      .select().single()
    if (dbError || !data) { setError('Ocurrió un error. Intenta de nuevo.'); setLoading(false); return }
    localStorage.setItem(`participant_${gameId}`, data.id)
    router.push(`/play/${gameId}`)
  }

  const baseColor = game?.color || '#6204BF'

  if (checking) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: baseColor, borderTopColor: 'transparent' }} />
    </div>
  )

  if (!game) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-900 mb-2">Juego no encontrado</p>
        <p className="text-gray-400 text-sm">El enlace puede ser incorrecto o el juego ya terminó.</p>
      </div>
    </div>
  )

  if (game.status === 'finished') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <span className="text-5xl">🏁</span>
        <p className="text-xl font-bold text-gray-900 mt-4 mb-2">Este juego ya finalizó</p>
        <p className="text-gray-400 text-sm">Pregunta al organizador por el próximo.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 py-10">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <p className="text-xs tracking-widest text-gray-400 uppercase mb-1">una experiencia.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanco.png" alt="Laborativo" className="h-10 object-contain" style={{ filter: 'brightness(0)' }} />
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">{game.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Ingresa tu nombre para participar</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nombre y apellido</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50"
              style={{ '--tw-ring-color': baseColor } as React.CSSProperties}
              placeholder=""
              autoFocus
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              autoComplete="name"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold text-base disabled:opacity-50 mt-2"
            style={{ background: baseColor }}
          >
            {loading ? 'Entrando...' : 'Unirme al juego →'}
          </button>
        </form>
      </div>
    </div>
  )
}
