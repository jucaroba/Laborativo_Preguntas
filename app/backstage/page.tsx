'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant, Answer } from '@/types'
import { ChevronRight, BarChart2, Users, Trophy, Play, Check } from 'lucide-react'

const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' }
const OPTION_COLORS: Record<string, string> = { a: '#1D4ED8', b: '#B91C1C', c: '#15803D', d: '#D97706' }

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

  async function handleShowResults() {
    if (!game || !currentQuestion) return
    const correctAnswers = answers.filter(a => a.question_id === currentQuestion.id && a.is_correct)
    for (const answer of correctAnswers) {
      const participant = participants.find(p => p.id === answer.participant_id)
      if (participant) {
        await supabase.from('participants').update({ score: participant.score + 1000 }).eq('id', participant.id)
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

  if (!gameId) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">Falta gameId en la URL</p></div>
  if (!game) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6204BF', borderTopColor: 'transparent' }} /></div>

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#6204BF' }}>
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Backstage · {game.name}</h1>
            <p className="text-xs text-gray-400">
              {game.status === 'waiting' ? 'Esperando inicio' : game.status === 'active' ? 'En curso' : 'Finalizado'}
              {' · '}{participants.length} participantes
            </p>
          </div>
        </div>
        <a
          href={`/screen?gameId=${gameId}`}
          target="_blank"
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: '#6204BF' }}
        >
          Ver pantalla ↗
        </a>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Panel izquierdo */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col gap-4 p-4 overflow-y-auto">

          {/* Control */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Control</p>

            {game.status === 'waiting' && (
              <button
                onClick={() => updateGame({ status: 'active', current_question_index: -1, show_results: false })}
                disabled={loading || questions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white disabled:opacity-40"
                style={{ background: '#6204BF' }}
              >
                <Play size={16} /> Iniciar juego
              </button>
            )}

            {game.status === 'active' && game.current_question_index === -1 && (
              <button
                onClick={() => updateGame({ current_question_index: 0, show_results: false })}
                disabled={loading || questions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40"
              >
                <Play size={16} /> Empezar preguntas
              </button>
            )}

            {game.status === 'active' && game.current_question_index >= 0 && !game.show_results && (
              <button
                onClick={handleShowResults}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-40"
              >
                <BarChart2 size={16} /> Mostrar resultados
              </button>
            )}

            {game.status === 'active' && game.current_question_index >= 0 && game.show_results && (
              <button
                onClick={handleNextQuestion}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white disabled:opacity-40"
                style={{ background: game.current_question_index + 1 >= questions.length ? '#059669' : '#6204BF' }}
              >
                {game.current_question_index + 1 >= questions.length
                  ? <><Trophy size={16} /> Finalizar juego</>
                  : <><ChevronRight size={16} /> Siguiente pregunta</>
                }
              </button>
            )}

            {game.status === 'finished' && (
              <div className="text-center py-2">
                <span className="text-3xl">🏆</span>
                <p className="text-sm text-gray-400 mt-1">Juego finalizado</p>
              </div>
            )}
          </div>

          {/* Pregunta actual */}
          {currentQuestion && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Pregunta {game.current_question_index + 1}/{questions.length}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-3 leading-snug">{currentQuestion.text}</p>
              <div className="space-y-1.5">
                {(['a', 'b', 'c', 'd'] as const).map(opt => {
                  const isCorrect = currentQuestion.correct_answer === opt
                  const count = answerCountsByOption[opt] || 0
                  const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
                  return (
                    <div key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'}`}>
                      <span className="font-bold w-4" style={{ color: isCorrect ? '#059669' : OPTION_COLORS[opt] }}>{OPTION_LABELS[opt]}</span>
                      <span className={`flex-1 truncate ${isCorrect ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{optText}</span>
                      {isCorrect && <Check size={12} className="text-green-600" />}
                      <span className="font-bold text-gray-500">{count}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-xs text-gray-400">
                <span>{answersForCurrentQ.length}/{participants.length} respondieron</span>
                <span className="text-green-600 font-medium">{correctForCurrentQ} correctas</span>
              </div>
            </div>
          )}

          {/* Progreso */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Progreso</p>
            <div className="space-y-1">
              {questions.map((q, idx) => {
                const isActive = idx === game.current_question_index
                const isDone = game.current_question_index >= 0 && idx < game.current_question_index
                return (
                  <div key={q.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isActive ? 'border' : ''}`}
                    style={isActive ? { background: '#F3E8FF', borderColor: '#6204BF', color: '#6204BF' } : {}}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                      isActive ? 'text-white' : isDone ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'
                    }`} style={isActive ? { background: '#6204BF' } : {}}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <span className={`flex-1 truncate ${isActive ? 'font-semibold' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>{q.text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Panel derecho */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F3E8FF' }}>
                <Users size={18} style={{ color: '#6204BF' }} />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{participants.length}</p>
                <p className="text-xs text-gray-400">Participantes</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50">
                <Check size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{answers.filter(a => a.is_correct).length}</p>
                <p className="text-xs text-gray-400">Respuestas correctas</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50">
                <BarChart2 size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{answers.length}</p>
                <p className="text-xs text-gray-400">Respuestas totales</p>
              </div>
            </div>
          </div>

          {/* Pendientes */}
          {currentQuestion && !game.show_results && participantsPending.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">
                Pendientes ({participantsPending.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {participantsPending.map(p => (
                  <span key={p.id} className="bg-white border border-amber-200 px-3 py-1 rounded-full text-sm text-amber-700">
                    {p.name} {p.last_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Trophy size={14} /> Puntaje actual
            </p>
            <div className="space-y-2">
              {participants.map((p, idx) => (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  idx === 0 ? 'border-yellow-200 bg-yellow-50' :
                  idx === 1 ? 'border-gray-200 bg-gray-50' :
                  idx === 2 ? 'border-orange-100 bg-orange-50' :
                  'border-gray-100 bg-white'
                }`}>
                  <span className="font-bold w-6 text-center text-sm text-gray-400">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </span>
                  <span className="flex-1 font-medium text-gray-900">{p.name} {p.last_name}</span>
                  {currentQuestion && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      participantsWhoAnswered.has(p.id)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {participantsWhoAnswered.has(p.id) ? 'Respondió' : 'Pendiente'}
                    </span>
                  )}
                  <span className="font-black text-lg" style={{ color: '#6204BF' }}>{p.score} pts</span>
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-gray-400 text-center py-8 text-sm">Esperando participantes...</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function BackstagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6204BF', borderTopColor: 'transparent' }} /></div>}>
      <BackstageContent />
    </Suspense>
  )
}
