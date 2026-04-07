'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant, Answer } from '@/types'
import { ChevronRight, BarChart2, Users, Trophy, Play, RotateCcw } from 'lucide-react'

const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' }

function BackstageContent() {
  const searchParams = useSearchParams()
  const gameId = searchParams.get('gameId')

  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!gameId) return
    const [gameRes, questionsRes, participantsRes, answersRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('questions').select('*').eq('game_id', gameId).order('order_index'),
      supabase.from('participants').select('*').eq('game_id', gameId).order('score', { ascending: false }),
      supabase.from('answers').select('*').eq('game_id', gameId),
    ])
    if (gameRes.data) setGame(gameRes.data)
    if (questionsRes.data) setQuestions(questionsRes.data)
    if (participantsRes.data) setParticipants(participantsRes.data)
    if (answersRes.data) setAnswers(answersRes.data)
  }, [gameId])

  useEffect(() => {
    loadData()

    if (!gameId) return

    const channel = supabase
      .channel('backstage')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `game_id=eq.${gameId}` }, loadData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
        setGame(payload.new as Game)
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, loadData])

  async function updateGame(patch: Partial<Game>) {
    if (!game) return
    setLoading(true)
    const { data } = await supabase.from('games').update(patch).eq('id', game.id).select().single()
    if (data) setGame(data)
    setLoading(false)
  }

  async function handleStartGame() {
    await updateGame({ status: 'active', current_question_index: -1, show_results: false })
  }

  async function handleStartQuestions() {
    await updateGame({ current_question_index: 0, show_results: false })
  }

  async function handleShowResults() {
    if (!game || !currentQuestion) return
    // Award points to participants who answered correctly
    const correctAnswers = answers.filter(
      a => a.question_id === currentQuestion.id && a.is_correct
    )
    for (const answer of correctAnswers) {
      const participant = participants.find(p => p.id === answer.participant_id)
      if (participant) {
        await supabase
          .from('participants')
          .update({ score: participant.score + 1000 })
          .eq('id', participant.id)
      }
    }
    await loadData()
    await updateGame({ show_results: true })
  }

  async function handleNextQuestion() {
    if (!game) return
    const nextIdx = game.current_question_index + 1
    if (nextIdx >= questions.length) {
      await updateGame({ status: 'finished', show_results: false })
    } else {
      await updateGame({ current_question_index: nextIdx, show_results: false })
    }
  }

  if (!gameId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <p className="opacity-50">Falta el parámetro gameId en la URL</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const currentQuestion = game.current_question_index >= 0 ? questions[game.current_question_index] : null
  const answersForCurrentQ = currentQuestion ? answers.filter(a => a.question_id === currentQuestion.id) : []
  const correctForCurrentQ = answersForCurrentQ.filter(a => a.is_correct).length

  const answerCountsByOption = ['a', 'b', 'c', 'd'].reduce((acc, opt) => {
    acc[opt] = answersForCurrentQ.filter(a => a.selected_option === opt).length
    return acc
  }, {} as Record<string, number>)

  const participantsWhoAnswered = new Set(answersForCurrentQ.map(a => a.participant_id))
  const participantsPending = participants.filter(p => !participantsWhoAnswered.has(p.id))

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-white">🎮 Backstage · {game.name}</h1>
          <p className="text-xs text-gray-400">
            {game.status === 'waiting' ? 'Esperando inicio' : game.status === 'active' ? 'Juego en curso' : 'Finalizado'}
            {' · '}{participants.length} participantes
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/screen?gameId=${gameId}`} target="_blank" className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium">
            Ver pantalla ↗
          </a>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Panel izquierdo: controles */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col p-4 gap-4">
          {/* Estado del juego */}
          <div className="bg-gray-900 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Control del juego</p>

            {game.status === 'waiting' && (
              <button
                onClick={handleStartGame}
                disabled={loading || questions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white disabled:opacity-40 transition-colors"
                style={{ background: '#6204BF' }}
              >
                <Play size={18} /> Iniciar juego
              </button>
            )}

            {game.status === 'active' && game.current_question_index === -1 && (
              <button
                onClick={handleStartQuestions}
                disabled={loading || questions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 transition-colors"
              >
                <Play size={18} /> Empezar preguntas
              </button>
            )}

            {game.status === 'active' && game.current_question_index >= 0 && !game.show_results && (
              <button
                onClick={handleShowResults}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 transition-colors"
              >
                <BarChart2 size={18} /> Mostrar resultados
              </button>
            )}

            {game.status === 'active' && game.current_question_index >= 0 && game.show_results && (
              <button
                onClick={handleNextQuestion}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-colors"
                style={{ background: game.current_question_index + 1 >= questions.length ? '#059669' : '#6204BF' }}
              >
                {game.current_question_index + 1 >= questions.length ? (
                  <><Trophy size={18} /> Finalizar juego</>
                ) : (
                  <><ChevronRight size={18} /> Siguiente pregunta</>
                )}
              </button>
            )}

            {game.status === 'finished' && (
              <div className="text-center py-3">
                <span className="text-2xl">🏆</span>
                <p className="text-sm text-gray-400 mt-1">Juego finalizado</p>
              </div>
            )}
          </div>

          {/* Pregunta actual */}
          {currentQuestion && (
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
                Pregunta {game.current_question_index + 1}/{questions.length}
              </p>
              <p className="text-sm text-white font-medium leading-snug mb-3">{currentQuestion.text}</p>

              <div className="space-y-1.5">
                {(['a', 'b', 'c', 'd'] as const).map(opt => {
                  const isCorrect = currentQuestion.correct_answer === opt
                  const count = answerCountsByOption[opt] || 0
                  const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
                  return (
                    <div
                      key={opt}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        isCorrect ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      <span className="font-bold w-4">{OPTION_LABELS[opt]}</span>
                      <span className="flex-1 truncate">{optText}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between text-xs text-gray-400">
                <span>{answersForCurrentQ.length}/{participants.length} respondieron</span>
                <span className="text-green-400">{correctForCurrentQ} correctas</span>
              </div>
            </div>
          )}

          {/* Progreso de preguntas */}
          <div className="bg-gray-900 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Preguntas</p>
            <div className="space-y-1">
              {questions.map((q, idx) => {
                const answered = answers.filter(a => a.question_id === q.id).length
                const isActive = idx === game.current_question_index
                const isDone = idx < game.current_question_index || (game.current_question_index >= 0 && idx <= game.current_question_index && game.show_results)
                return (
                  <div
                    key={q.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                      isActive ? 'bg-purple-900/50 text-purple-300' :
                      isDone ? 'bg-gray-800/50 text-gray-500' :
                      'text-gray-500'
                    }`}
                  >
                    <span className="font-bold w-4">{idx + 1}</span>
                    <span className="flex-1 truncate">{q.text}</span>
                    {answered > 0 && <span className="text-gray-500">{answered}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Panel derecho: participantes y leaderboard */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Stats */}
            <div className="bg-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-900 flex items-center justify-center">
                <Users size={20} className="text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-black">{participants.length}</p>
                <p className="text-xs text-gray-400">Participantes</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-900 flex items-center justify-center">
                <BarChart2 size={20} className="text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-black">{answers.length}</p>
                <p className="text-xs text-gray-400">Respuestas totales</p>
              </div>
            </div>
          </div>

          {/* Pendientes de responder (pregunta actual) */}
          {currentQuestion && !game.show_results && participantsPending.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-6">
              <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-3">
                Pendientes de responder ({participantsPending.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {participantsPending.map(p => (
                  <span key={p.id} className="bg-amber-900/40 px-3 py-1 rounded-full text-sm text-amber-300">
                    {p.name} {p.last_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy size={14} /> Puntaje actual
            </p>
            <div className="space-y-2">
              {participants.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                    idx === 0 ? 'bg-yellow-900/30 border border-yellow-700/40' :
                    idx === 1 ? 'bg-gray-700/50 border border-gray-600/40' :
                    idx === 2 ? 'bg-amber-900/30 border border-amber-800/40' :
                    'bg-gray-800'
                  }`}
                >
                  <span className="text-gray-400 font-bold w-6 text-center text-sm">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </span>
                  <span className="flex-1 font-medium">{p.name} {p.last_name}</span>

                  {/* Badge: respondió la pregunta actual */}
                  {currentQuestion && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      participantsWhoAnswered.has(p.id) ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-500'
                    }`}>
                      {participantsWhoAnswered.has(p.id) ? 'Respondió' : 'Pendiente'}
                    </span>
                  )}

                  <span className="font-black text-lg" style={{ color: '#A78BFA' }}>{p.score} pts</span>
                </div>
              ))}

              {participants.length === 0 && (
                <p className="text-gray-500 text-center py-8">Esperando participantes...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BackstagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BackstageContent />
    </Suspense>
  )
}
