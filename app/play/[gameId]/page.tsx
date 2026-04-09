'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant, AnswerOption } from '@/types'

import { generateOptionColors, BASE_COLOR } from '@/lib/theme'

export default function PlayPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myAnswer, setMyAnswer] = useState<AnswerOption | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const prevQuestionIndexRef = useRef<number>(-99)
  const participantId = typeof window !== 'undefined' ? localStorage.getItem(`participant_${gameId}`) : null
  const baseColor = game?.color || BASE_COLOR
  const OPTION_COLORS = generateOptionColors(baseColor)

  const loadParticipant = useCallback(async (id: string) => {
    const { data } = await supabase.from('participants').select('*').eq('id', id).single()
    if (data) setParticipant(data)
  }, [])

  useEffect(() => {
    if (!participantId) { router.replace(`/join/${gameId}`); return }
    async function init() {
      const [gameRes, questionsRes, participantsRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('questions').select('*').eq('game_id', gameId).order('order_index'),
        supabase.from('participants').select('*').eq('game_id', gameId).order('score', { ascending: false }),
      ])
      if (gameRes.data) setGame(gameRes.data)
      if (questionsRes.data) setQuestions(questionsRes.data)
      if (participantsRes.data) setParticipants(participantsRes.data)
      loadParticipant(participantId!)
    }
    init()
    const channel = supabase
      .channel('play')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, async payload => {
        setGame(payload.new as Game)
        if (payload.new.status === 'finished') {
          const { data } = await supabase.from('participants').select('*').eq('game_id', gameId).order('score', { ascending: false })
          if (data) setParticipants(data)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, participantId, router, loadParticipant])

  useEffect(() => {
    if (!game) return
    const newIdx = game.current_question_index
    if (newIdx !== prevQuestionIndexRef.current) {
      prevQuestionIndexRef.current = newIdx
      setMyAnswer(null)
      setIsCorrect(null)
      if (newIdx >= 0 && participantId && questions[newIdx]) {
        supabase.from('answers').select('*').eq('participant_id', participantId).eq('question_id', questions[newIdx].id).single()
          .then(({ data }) => { if (data) { setMyAnswer(data.selected_option); setIsCorrect(data.is_correct) } })
      }
    }
  }, [game?.current_question_index, questions, participantId, game])

  useEffect(() => {
    if (game?.show_results && participantId) loadParticipant(participantId)
  }, [game?.show_results, participantId, loadParticipant])

  async function submitAnswer(option: AnswerOption) {
    if (!game || !participantId || myAnswer || submitting) return
    const currentQ = questions[game.current_question_index]
    if (!currentQ) return
    setSubmitting(true)
    setMyAnswer(option)
    const correct = option === currentQ.correct_answer
    setIsCorrect(correct)
    await supabase.from('answers').insert({
      participant_id: participantId, question_id: currentQ.id,
      game_id: gameId, selected_option: option, is_correct: correct,
    })
    setSubmitting(false)
  }

  if (!participantId) return null

  if (!game) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: baseColor, borderTopColor: 'transparent' }} />
    </div>
  )

  const currentQuestion = game.current_question_index >= 0 ? questions[game.current_question_index] : null

  // Finalizado
  if (game.status === 'finished') {
    const myRank = participant ? participants.findIndex(p => p.id === participant.id) + 1 : 0
    const podium = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : null
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 text-center">
        <span className="text-6xl mb-4">🏆</span>
        <h1 className="text-2xl font-black text-gray-900 mb-2">¡Juego terminado!</h1>
        {participant && (
          <div className="bg-white border border-gray-200 rounded-2xl px-8 py-6 shadow-sm mt-4 w-full max-w-xs">
            {podium && <p className="text-5xl mb-2">{podium}</p>}
            {myRank > 0 && (
              <p className="text-gray-400 text-sm mb-3">
                {podium ? `¡Quedaste en el puesto ${myRank}!` : `Puesto ${myRank}`}
              </p>
            )}
            <p className="text-gray-400 text-sm mb-1">Puntaje final</p>
            <p className="text-5xl font-black" style={{ color: baseColor }}>
              {participant.score} <span className="text-2xl font-semibold text-gray-300">/ {questions.length * 10}</span>
            </p>
          </div>
        )}
      </div>
    )
  }

  // Esperando
  if (game.status === 'waiting' || game.current_question_index === -1) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: baseColor }}>
          <span className="text-white font-black text-lg">L</span>
        </div>
        <span className="text-xl font-black text-gray-900">Laborativo</span>
      </div>

      <div className="w-full max-w-xs bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ background: '#F5F5F5', color: baseColor }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
          Conectado
        </div>
        <p className="text-xl font-black text-gray-900 mb-1">{game.name}</p>
        {participant && <p className="text-gray-400 text-sm mb-6">{participant.name} {participant.last_name}</p>}
        <p className="text-gray-400 text-sm">Espera a que el organizador inicie las preguntas...</p>
        <div className="mt-6 flex justify-center gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 rounded-full inline-block"
              style={{ background: baseColor, animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`, opacity: 0.5 }} />
          ))}
        </div>
      </div>
    </div>
  )

  // Resultados
  if (game.show_results && currentQuestion) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-4">
        {myAnswer ? (
          <div className={`rounded-2xl p-6 text-center border-2 ${isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            <span className="text-4xl">{isCorrect ? '✅' : '❌'}</span>
            <p className="text-xl font-black mt-2 mb-1" style={{ color: isCorrect ? '#15803D' : '#B91C1C' }}>
              {isCorrect ? '¡Correcto!' : 'Incorrecto'}
            </p>
            <p className="text-sm text-gray-500">
              Respuesta correcta: <strong>{(currentQuestion as unknown as Record<string, string>)[`option_${currentQuestion.correct_answer}`]}</strong>
            </p>
          </div>
        ) : (
          <div className="bg-gray-100 rounded-2xl p-6 text-center border-2 border-gray-200">
            <span className="text-4xl">⏰</span>
            <p className="text-gray-600 font-bold mt-2">No respondiste a tiempo</p>
            <p className="text-sm text-gray-400 mt-1">
              Respuesta: <strong>{(currentQuestion as unknown as Record<string, string>)[`option_${currentQuestion.correct_answer}`]}</strong>
            </p>
          </div>
        )}

        {participant && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Tu puntaje actual</p>
            <p className="text-4xl font-black mt-1" style={{ color: baseColor }}>{participant.score}</p>
            <p className="text-gray-400 text-xs mt-0.5">puntos</p>
          </div>
        )}

        <p className="text-center text-gray-400 text-sm">Espera la siguiente pregunta...</p>
      </div>
    </div>
  )

  // Pregunta activa
  if (currentQuestion) return (
    <div className="min-h-screen bg-gray-50 flex flex-col px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: baseColor }}>
            <span className="text-white font-black text-xs">L</span>
          </div>
          <span className="text-xs font-semibold text-gray-500">
            Pregunta {game.current_question_index + 1}/{questions.length}
          </span>
        </div>
        {participant && (
          <span className="text-sm font-black" style={{ color: baseColor }}>{participant.score} pts</span>
        )}
      </div>

      {/* Pregunta */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
        <p className="text-base font-bold text-gray-900 leading-snug">{currentQuestion.text}</p>
      </div>

      {/* Opciones */}
      <div className="space-y-3 flex-1">
        {(['a', 'b', 'c', 'd'] as const).map(opt => {
          const color = OPTION_COLORS[opt]
          const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
          const isSelected = myAnswer === opt

          if (myAnswer) {
            return (
              <div key={opt} className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 ${isSelected ? 'border-transparent text-white' : 'bg-white border-gray-200 text-gray-400'}`}
                style={isSelected ? { background: color.bg } : {}}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {color.label}
                </div>
                <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>{optText}</span>
                {isSelected && <span className="ml-auto text-white/70 text-xs">Tu respuesta</span>}
              </div>
            )
          }

          return (
            <button key={opt} onClick={() => submitAnswer(opt)} disabled={submitting}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-white font-medium text-left disabled:opacity-70 active:scale-95 transition-transform"
              style={{ background: color.bg }}>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-sm flex-shrink-0">
                {color.label}
              </div>
              <span>{optText}</span>
            </button>
          )
        })}
      </div>

      {myAnswer && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
            <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: baseColor }} />
            Respuesta registrada, esperando resultados...
          </div>
        </div>
      )}
    </div>
  )

  return null
}
