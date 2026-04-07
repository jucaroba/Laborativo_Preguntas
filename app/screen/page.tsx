'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant } from '@/types'
import QRCode from 'react-qr-code'

import { OPTION_COLORS } from '@/lib/theme'

function ScreenContent() {
  const searchParams = useSearchParams()
  const gameId = searchParams.get('gameId')

  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answerCounts, setAnswerCounts] = useState<Record<string, number>>({})
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => { setAppUrl(window.location.origin) }, [])

  const loadParticipants = useCallback(async () => {
    if (!gameId) return
    const { data } = await supabase.from('participants').select('*').eq('game_id', gameId).order('score', { ascending: false })
    if (data) setParticipants(data)
  }, [gameId])

  const loadAnswerCounts = useCallback(async (questionId: string) => {
    const { data } = await supabase.from('answers').select('selected_option').eq('question_id', questionId)
    if (data) {
      const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
      data.forEach(a => { counts[a.selected_option] = (counts[a.selected_option] || 0) + 1 })
      setAnswerCounts(counts)
    }
  }, [])

  useEffect(() => {
    if (!gameId) return
    async function init() {
      const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (g) setGame(g)
      const { data: q } = await supabase.from('questions').select('*').eq('game_id', gameId).order('order_index')
      if (q) setQuestions(q)
      loadParticipants()
    }
    init()

    const gameChannel = supabase.channel('screen-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
        setGame(payload.new as Game)
        loadParticipants()
      }).subscribe()

    const participantsChannel = supabase.channel('screen-participants')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, loadParticipants)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, loadParticipants)
      .subscribe()

    const answersChannel = supabase.channel('screen-answers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `game_id=eq.${gameId}` }, payload => {
        const opt = payload.new.selected_option
        setAnswerCounts(prev => ({ ...prev, [opt]: (prev[opt] || 0) + 1 }))
      }).subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
      supabase.removeChannel(participantsChannel)
      supabase.removeChannel(answersChannel)
    }
  }, [gameId, loadParticipants])

  useEffect(() => {
    if (!game || game.current_question_index < 0) return
    const currentQ = questions[game.current_question_index]
    if (currentQ) {
      setAnswerCounts({ a: 0, b: 0, c: 0, d: 0 })
      loadAnswerCounts(currentQ.id)
    }
  }, [game?.current_question_index, questions, game, loadAnswerCounts])

  if (!gameId) return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center text-white">
      <p className="opacity-40">Falta el parámetro gameId en la URL</p>
    </div>
  )

  if (!game) return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6204BF', borderTopColor: 'transparent' }} />
    </div>
  )

  const currentQuestion = game.current_question_index >= 0 ? questions[game.current_question_index] : null
  const totalAnswers = Object.values(answerCounts).reduce((a, b) => a + b, 0)

  // ── FINALIZADO ──────────────────────────────────────────────────────────────
  if (game.status === 'finished') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-12">
      <div className="text-7xl mb-4">🏆</div>
      <h1 className="text-5xl font-black text-gray-900 mb-2">¡Resultados finales!</h1>
      <p className="mb-10 text-lg font-semibold" style={{ color: '#6204BF' }}>{game.name}</p>
      <div className="w-full max-w-lg space-y-3">
        {participants.slice(0, 10).map((p, idx) => (
          <div key={p.id} className={`flex items-center gap-4 px-6 py-4 rounded-2xl border ${
            idx === 0 ? 'border-yellow-300 bg-yellow-50' :
            idx === 1 ? 'border-gray-300 bg-gray-100' :
            idx === 2 ? 'border-orange-200 bg-orange-50' :
            'border-gray-200 bg-white'
          }`}>
            <span className="text-2xl font-black w-8 text-center">
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
            </span>
            <span className="flex-1 text-xl font-semibold text-gray-900">{p.name} {p.last_name}</span>
            <span className="text-2xl font-black" style={{ color: '#6204BF' }}>{p.score} pts</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── QR / Esperando ──────────────────────────────────────────────────────────
  if (game.current_question_index === -1 || game.status === 'waiting') {
    const joinUrl = `${appUrl}/join/${gameId}`
    return (
      <div className="min-h-screen bg-[#0D0D1A] flex flex-col items-center justify-center text-white">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanco.png" alt="Laborativo" className="h-14 object-contain mb-3" />
          <p className="text-xl font-semibold" style={{ color: '#A78BFA' }}>{game.name}</p>
        </div>

        {/* QR */}
        <div className="bg-white p-5 rounded-3xl shadow-2xl mb-8">
          <QRCode value={joinUrl} size={240} />
        </div>

        <p className="text-2xl font-bold mb-10">Escanea para unirte</p>

        {participants.length > 0 && (
          <div className="text-center">
            <p className="text-sm mb-3" style={{ color: '#A78BFA' }}>
              {participants.length} participante{participants.length !== 1 ? 's' : ''} conectado{participants.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-3xl">
              {participants.map(p => (
                <span key={p.id} className="px-3 py-1 rounded-full text-sm font-medium text-white" style={{ background: '#1F1F2E', border: '1px solid #374151' }}>
                  {p.name} {p.last_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Header compartido para pantallas de pregunta
  const ScreenHeader = () => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanco.png" alt="Laborativo" className="h-8 object-contain" />
        <span className="font-semibold text-white/50 text-sm">
          Pregunta {game.current_question_index + 1} / {questions.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
        <span className="text-white/50 text-sm">{totalAnswers} respondieron</span>
      </div>
    </div>
  )

  // ── RESULTADOS de pregunta ──────────────────────────────────────────────────
  if (game.show_results && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col px-14 py-10">
        {/* Header claro */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanco.png" alt="Laborativo" className="h-8 object-contain" style={{ filter: 'invert(1) brightness(0) saturate(100%) invert(13%) sepia(85%) saturate(5000%) hue-rotate(265deg) brightness(70%)' }} />
            <span className="font-semibold text-gray-400 text-sm">
              Pregunta {game.current_question_index + 1} / {questions.length}
            </span>
          </div>
          <span className="text-gray-400 text-sm">{totalAnswers} respuestas</span>
        </div>

        <h2 className="text-4xl font-black text-gray-900 mb-8 leading-tight max-w-4xl">{currentQuestion.text}</h2>

        <div className="space-y-3 flex-1">
          {(['a', 'b', 'c', 'd'] as const).map(opt => {
            const color = OPTION_COLORS[opt]
            const count = answerCounts[opt] || 0
            const pct = totalAnswers > 0 ? (count / totalAnswers) * 100 : 0
            const isCorrect = currentQuestion.correct_answer === opt
            const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
            return (
              <div key={opt} className="relative rounded-2xl overflow-hidden border-2" style={{
                borderColor: isCorrect ? '#10B981' : '#E5E7EB',
                background: isCorrect ? '#F0FDF4' : 'white',
              }}>
                <div className="absolute left-0 top-0 bottom-0 transition-all duration-700"
                  style={{ width: `${pct}%`, background: isCorrect ? '#10B98120' : color.bg + '15' }} />
                <div className="relative flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                    style={{ background: isCorrect ? '#10B981' : color.bg }}>
                    {color.label}
                  </div>
                  <span className={`flex-1 text-xl font-semibold ${isCorrect ? 'text-green-800' : 'text-gray-900'}`}>{optText}</span>
                  <div className="flex items-center gap-3">
                    {isCorrect && <span className="text-2xl">✅</span>}
                    <span className="text-2xl font-black" style={{ color: isCorrect ? '#10B981' : color.bg }}>{count}</span>
                    <span className="text-sm text-gray-400 w-10 text-right">{Math.round(pct)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Mini leaderboard */}
        <div className="mt-6 pt-5 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Puntaje actual</p>
          <div className="flex gap-6">
            {participants.slice(0, 8).map((p) => (
              <div key={p.id} className="text-center">
                <div className="text-xl font-black" style={{ color: '#6204BF' }}>{p.score}</div>
                <div className="text-xs text-gray-400 max-w-[70px] truncate">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── PREGUNTA ACTIVA ─────────────────────────────────────────────────────────
  if (currentQuestion) return (
    <div className="min-h-screen bg-gray-50 flex flex-col px-14 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanco.png" alt="Laborativo" className="h-8 object-contain" style={{ filter: 'invert(1) brightness(0) saturate(100%) invert(13%) sepia(85%) saturate(5000%) hue-rotate(265deg) brightness(70%)' }} />
          <span className="font-semibold text-gray-400 text-sm">
            Pregunta {game.current_question_index + 1} / {questions.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
          <span className="text-gray-400 text-sm">{totalAnswers} respondieron</span>
        </div>
      </div>

      <h2 className="text-5xl font-black text-gray-900 leading-tight max-w-5xl mb-8">{currentQuestion.text}</h2>

      <div className="grid grid-cols-2 gap-4">
        {(['a', 'b', 'c', 'd'] as const).map(opt => {
          const color = OPTION_COLORS[opt]
          const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
          return (
            <div key={opt} className="flex items-center gap-4 px-6 py-5 rounded-2xl text-white" style={{ background: color.bg }}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg flex-shrink-0">
                {color.label}
              </div>
              <span className="text-xl font-semibold leading-snug">{optText}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return null
}

export default function ScreenPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6204BF', borderTopColor: 'transparent' }} />
      </div>
    }>
      <ScreenContent />
    </Suspense>
  )
}
