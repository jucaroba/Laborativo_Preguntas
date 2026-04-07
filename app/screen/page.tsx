'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant } from '@/types'
import QRCode from 'react-qr-code'
import { Suspense } from 'react'

const OPTION_COLORS = {
  a: { bg: '#1D4ED8', light: '#DBEAFE', label: 'A' },
  b: { bg: '#B91C1C', light: '#FEE2E2', label: 'B' },
  c: { bg: '#15803D', light: '#DCFCE7', label: 'C' },
  d: { bg: '#D97706', light: '#FEF3C7', label: 'D' },
}

function ScreenContent() {
  const searchParams = useSearchParams()
  const gameId = searchParams.get('gameId')

  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answerCounts, setAnswerCounts] = useState<Record<string, number>>({})
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => {
    setAppUrl(window.location.origin)
  }, [])

  const loadParticipants = useCallback(async () => {
    if (!gameId) return
    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false })
    if (data) setParticipants(data)
  }, [gameId])

  const loadAnswerCounts = useCallback(async (questionId: string) => {
    if (!questionId) return
    const { data } = await supabase
      .from('answers')
      .select('selected_option')
      .eq('question_id', questionId)
    if (data) {
      const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
      data.forEach(a => { counts[a.selected_option] = (counts[a.selected_option] || 0) + 1 })
      setAnswerCounts(counts)
    }
  }, [])

  useEffect(() => {
    if (!gameId) return

    async function init() {
      const { data: gameData } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (gameData) setGame(gameData)

      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('order_index')
      if (questionsData) setQuestions(questionsData)

      loadParticipants()
    }
    init()

    // Realtime: game state changes
    const gameChannel = supabase
      .channel('screen-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
        setGame(payload.new as Game)
        loadParticipants()
      })
      .subscribe()

    // Realtime: participants joining
    const participantsChannel = supabase
      .channel('screen-participants')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, () => {
        loadParticipants()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, () => {
        loadParticipants()
      })
      .subscribe()

    // Realtime: answers coming in
    const answersChannel = supabase
      .channel('screen-answers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `game_id=eq.${gameId}` }, payload => {
        const opt = payload.new.selected_option
        setAnswerCounts(prev => ({ ...prev, [opt]: (prev[opt] || 0) + 1 }))
      })
      .subscribe()

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

  if (!gameId) {
    return (
      <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center text-white">
        <p className="text-xl opacity-50">Falta el parámetro gameId en la URL</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const currentQuestion = game.current_question_index >= 0 ? questions[game.current_question_index] : null
  const totalAnswers = Object.values(answerCounts).reduce((a, b) => a + b, 0)

  // ── PANTALLA: Juego finalizado ──────────────────────────────────────────────
  if (game.status === 'finished') {
    return (
      <div className="min-h-screen bg-[#0D0D1A] flex flex-col items-center justify-center text-white px-8">
        <div className="text-6xl mb-6">🏆</div>
        <h1 className="text-4xl font-black mb-2">¡Resultados finales!</h1>
        <p className="text-purple-300 mb-12 text-lg">{game.name}</p>

        <div className="w-full max-w-lg space-y-3">
          {participants.slice(0, 10).map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center gap-4 px-6 py-4 rounded-2xl ${
                idx === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' :
                idx === 1 ? 'bg-gray-400/20 border border-gray-400/40' :
                idx === 2 ? 'bg-amber-700/20 border border-amber-700/40' :
                'bg-white/5 border border-white/10'
              }`}
            >
              <span className="text-2xl font-black w-8 text-center">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
              </span>
              <span className="flex-1 text-lg font-semibold">{p.name} {p.last_name}</span>
              <span className="text-2xl font-black" style={{ color: '#A78BFA' }}>{p.score} pts</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── PANTALLA: QR / Esperando ────────────────────────────────────────────────
  if (game.current_question_index === -1 || game.status === 'waiting') {
    const joinUrl = `${appUrl}/join/${gameId}`
    return (
      <div className="min-h-screen bg-[#0D0D1A] flex flex-col items-center justify-center text-white">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#6204BF' }}>
              <span className="text-white font-black text-lg">L</span>
            </div>
            <span className="text-2xl font-black tracking-tight">Laborativo</span>
          </div>
          <h1 className="text-5xl font-black mt-4 text-center">{game.name}</h1>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8">
          <QRCode value={joinUrl} size={220} />
        </div>

        <p className="text-xl font-semibold text-purple-200 mb-2">Escanea el código para unirte</p>
        <p className="text-sm text-white/40 font-mono">{joinUrl}</p>

        {participants.length > 0 && (
          <div className="mt-10 text-center">
            <p className="text-purple-300 text-sm mb-3">{participants.length} participante{participants.length !== 1 ? 's' : ''} conectado{participants.length !== 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
              {participants.map(p => (
                <span key={p.id} className="bg-white/10 px-3 py-1 rounded-full text-sm">
                  {p.name} {p.last_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── PANTALLA: Resultados de pregunta ────────────────────────────────────────
  if (game.show_results && currentQuestion) {
    const maxCount = Math.max(...Object.values(answerCounts), 1)
    return (
      <div className="min-h-screen bg-[#0D0D1A] text-white flex flex-col px-12 py-10">
        <div className="flex items-center justify-between mb-6">
          <span className="text-purple-400 font-semibold text-lg">
            Pregunta {game.current_question_index + 1} / {questions.length}
          </span>
          <span className="text-purple-400">{totalAnswers} respuestas</span>
        </div>

        <h2 className="text-4xl font-black mb-10 leading-tight max-w-4xl">{currentQuestion.text}</h2>

        {/* Barras de resultados */}
        <div className="space-y-4 flex-1">
          {(['a', 'b', 'c', 'd'] as const).map(opt => {
            const color = OPTION_COLORS[opt]
            const count = answerCounts[opt] || 0
            const pct = totalAnswers > 0 ? (count / totalAnswers) * 100 : 0
            const isCorrect = currentQuestion.correct_answer === opt
            const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]

            return (
              <div key={opt} className="relative">
                <div
                  className="flex items-center gap-4 px-6 py-5 rounded-2xl border-2 overflow-hidden relative"
                  style={{
                    borderColor: isCorrect ? '#10B981' : color.bg + '60',
                    background: isCorrect ? '#10B98115' : color.bg + '15',
                  }}
                >
                  {/* Barra de progreso de fondo */}
                  <div
                    className="absolute left-0 top-0 bottom-0 transition-all duration-700 rounded-2xl"
                    style={{
                      width: `${pct}%`,
                      background: isCorrect ? '#10B98130' : color.bg + '30',
                    }}
                  />

                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg relative z-10 flex-shrink-0"
                    style={{ background: isCorrect ? '#10B981' : color.bg }}
                  >
                    {color.label}
                  </div>
                  <span className="flex-1 text-xl font-semibold relative z-10">{optText}</span>
                  <div className="flex items-center gap-3 relative z-10">
                    {isCorrect && <span className="text-2xl">✅</span>}
                    <span className="text-2xl font-black" style={{ color: isCorrect ? '#10B981' : color.bg }}>
                      {count}
                    </span>
                    <span className="text-white/40 text-sm w-12 text-right">{Math.round(pct)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Mini leaderboard */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-purple-400 text-sm font-semibold mb-3">PUNTAJE ACTUAL</p>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {participants.slice(0, 8).map((p, idx) => (
              <div key={p.id} className="flex-shrink-0 text-center">
                <div className="text-lg font-black" style={{ color: '#A78BFA' }}>{p.score}</div>
                <div className="text-xs text-white/60 max-w-[80px] truncate">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── PANTALLA: Pregunta activa ────────────────────────────────────────────────
  if (currentQuestion) {
    return (
      <div className="min-h-screen bg-[#0D0D1A] text-white flex flex-col px-12 py-10">
        <div className="flex items-center justify-between mb-6">
          <span className="text-purple-400 font-semibold text-lg">
            Pregunta {game.current_question_index + 1} / {questions.length}
          </span>
          <div className="flex items-center gap-2 text-purple-400">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>{totalAnswers} respondieron</span>
          </div>
        </div>

        <h2 className="text-5xl font-black mb-12 leading-tight max-w-5xl flex-1 flex items-center">
          {currentQuestion.text}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {(['a', 'b', 'c', 'd'] as const).map(opt => {
            const color = OPTION_COLORS[opt]
            const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
            return (
              <div
                key={opt}
                className="flex items-center gap-4 px-6 py-5 rounded-2xl"
                style={{ background: color.bg }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                  {color.label}
                </div>
                <span className="text-xl font-semibold leading-snug">{optText}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return null
}

export default function ScreenPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ScreenContent />
    </Suspense>
  )
}
