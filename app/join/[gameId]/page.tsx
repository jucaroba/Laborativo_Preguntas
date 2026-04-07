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
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const existingId = localStorage.getItem(`participant_${gameId}`)
    if (existingId) { router.replace(`/play/${gameId}`); return }
    async function loadGame() {
      const { data } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (data) setGame(data)
      setChecking(false)
    }
    loadGame()
  }, [gameId, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !lastName.trim()) { setError('Por favor ingresa tu nombre y apellido'); return }
    setLoading(true)
    setError('')
    const { data, error: dbError } = await supabase
      .from('participants')
      .insert({ game_id: gameId, name: name.trim(), last_name: lastName.trim(), score: 0 })
      .select().single()
    if (dbError || !data) { setError('Ocurrió un error. Intenta de nuevo.'); setLoading(false); return }
    localStorage.setItem(`participant_${gameId}`, data.id)
    router.push(`/play/${gameId}`)
  }

  if (checking) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6204BF', borderTopColor: 'transparent' }} />
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
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#6204BF' }}>
          <span className="text-white font-black text-lg">L</span>
        </div>
        <span className="text-xl font-black text-gray-900">Laborativo</span>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3" style={{ background: '#F3E8FF', color: '#6204BF' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            En vivo
          </div>
          <h1 className="text-2xl font-black text-gray-900">{game.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Ingresa tu nombre para participar</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nombre</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50"
              style={{ '--tw-ring-color': '#6204BF' } as React.CSSProperties}
              placeholder="Tu nombre"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="given-name"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Apellido</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50"
              style={{ '--tw-ring-color': '#6204BF' } as React.CSSProperties}
              placeholder="Tu apellido"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              autoComplete="family-name"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold text-base disabled:opacity-50 mt-2"
            style={{ background: '#6204BF' }}
          >
            {loading ? 'Entrando...' : 'Unirme al juego →'}
          </button>
        </form>
      </div>
    </div>
  )
}
