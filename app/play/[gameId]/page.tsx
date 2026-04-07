'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Game, Question, Participant, AnswerOption } from '@/types'

const OPTION_COLORS = {
  a: { bg: '#1D4ED8', hover: '#1E40AF', label: 'A' },
  b: { bg: '#B91C1C', hover: '#991B1B', label: 'B' },
  c: { bg: '#15803D', hover: '#166534', label: 'C' },
  d: { bg: '#D97706', hover: '#B45309', label: 'D' },
}

export default function PlayPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [myAnswer, setMyAnswer] = useState<AnswerOption | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  // Track answered questions to reset state when question changes
  const prevQuestionIndexRef = useRef<number>(-99)

  const participantId = typeof window !== 'undefined' ? localStorage.getItem(`participant_${gameId}`) : null

  const loadParticipant = useCallback(async (id: string) => {
    const { data } = await supabase.from('participants').select('*').eq('id', id).single()
    if (data) setParticipant(data)
  }, [])

  useEffect(() => {
    if (!participantId) {
      router.replace(`/join/${gameId}`)
      return
    }

    async function init() {
      const [gameRes, questionsRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('questions').select('*').eq('game_id', gameId).order('order_index'),
      ])
      if (gameRes.data) setGame(gameRes.data)
      if (questionsRes.data) setQuestions(questionsRes.data)
      loadParticipant(participantId!)
    }
    init()

    const channel = supabase
      .channel('play')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, payload => {
        setGame(payload.new as Game)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, participantId, router, loadParticipant])

  // Reset answer state when question changes
  useEffect(() => {
    if (!game) return
    const newIdx = game.current_question_index
    if (newIdx !== prevQuestionIndexRef.current) {
      prevQuestionIndexRef.current = newIdx
      setMyAnswer(null)
      setIsCorrect(null)

      // Check if already answered this question (e.g. page reload)
      if (newIdx >= 0 && participantId && questions[newIdx]) {
        const checkAnswer = async () => {
          const { data } = await supabase
            .from('answers')
            .select('*')
            .eq('participant_id', participantId)
            .eq('question_id', questions[newIdx].id)
            .single()
          if (data) {
            setMyAnswer(data.selected_option)
            setIsCorrect(data.is_correct)
          }
        }
        checkAnswer()
      }
    }
  }, [game?.current_question_index, questions, participantId, game])

  // Reload participant score when results are shown
  useEffect(() => {
    if (game?.show_results && participantId) {
      loadParticipant(participantId)
    }
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
      participant_id: participantId,
      question_id: currentQ.id,
      game_id: gameId,
      selected_option: option,
      is_correct: correct,
    })

    setSubmitting(false)
  }

  if (!participantId) return null

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const currentQuestion = game.current_question_index >= 0 ? questions[game.current_question_index] : null

  // ── FINALIZADO ──────────────────────────────────────────────────────────────
  if (game.status === 'finished') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 text-center">
        <span className="text-6xl mb-4">🏆</span>
        <h1 className="text-3xl font-black text-gray-900 mb-2">¡Juego terminado!</h1>
        <p className="text-gray-500 mb-8">Mira la pantalla para ver los resultados finales</p>
        {participant && (
          <div className="bg-white border border-gray-200 rounded-2xl px-8 py-6 shadow-sm">
            <p className="text-gray-500 text-sm mb-1">Tu puntaje final</p>
            <p className="text-5xl font-black" style={{ color: '#6204BF' }}>{participant.score}</p>
            <p className="text-gray-400 text-sm mt-1">puntos</p>
          </div>
        )}
      </div>
    )
  }

  // ── ESPERANDO / QR ──────────────────────────────────────────────────────────
  if (game.status === 'waiting' || game.current_question_index === -1) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5 text-center">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#6204BF' }}>
            <span className="text-white font-black text-base">L</span>
          </div>
          <span className="text-xl font-black text-gray-900">Laborativo</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl px-8 py-8 shadow-sm max-w-xs w-full">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-600 font-semibold text-sm">Conectado</span>
          </div>
          <p className="text-2xl font-black text-gray-900 mb-1">{game.name}</p>
          {participant && (
            <p className="text-gray-500 mb-6">{participant.name} {participant.last_name}</p>
          )}
          <p className="text-gray-400 text-sm">Espera a que el organizador inicie las preguntas...</p>

          <div className="mt-6 flex justify-center">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: '#6204BF',
                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── RESULTADOS de pregunta ──────────────────────────────────────────────────
  if (game.show_results && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm">
          {/* Resultado personal */}
          {myAnswer ? (
            <div className={`rounded-2xl p-6 text-center mb-6 ${
              isCorrect ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'
            }`}>
              <span className="text-4xl">{isCorrect ? '✅' : '❌'}</span>
              <p className="text-lg font-black mt-2 mb-1" style={{ color: isCorrect ? '#15803D' : '#B91C1C' }}>
                {isCorrect ? '¡Correcto!' : 'Incorrecto'}
              </p>
              <p className="text-sm text-gray-500">
                La respuesta correcta era: <strong>{(currentQuestion as unknown as Record<string, string>)[`option_${currentQuestion.correct_answer}`]}</strong>
              </p>
            </div>
          ) : (
            <div className="bg-gray-100 rounded-2xl p-6 text-center mb-6">
              <span className="text-4xl">⏰</span>
              <p className="text-gray-500 mt-2">No respondiste a tiempo</p>
              <p className="text-sm text-gray-400 mt-1">
                La respuesta era: <strong>{(currentQuestion as unknown as Record<string, string>)[`option_${currentQuestion.correct_answer}`]}</strong>
              </p>
            </div>
          )}

          {/* Puntaje actual */}
          {participant && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center shadow-sm">
              <p className="text-gray-500 text-sm">Tu puntaje actual</p>
              <p className="text-4xl font-black mt-1" style={{ color: '#6204BF' }}>{participant.score}</p>
              <p className="text-gray-400 text-xs mt-1">puntos</p>
            </div>
          )}

          <p className="text-center text-gray-400 text-sm mt-6">Espera la siguiente pregunta...</p>
        </div>
      </div>
    )
  }

  // ── PREGUNTA ACTIVA ─────────────────────────────────────────────────────────
  if (currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-gray-500">
            Pregunta {game.current_question_index + 1}/{questions.length}
          </span>
          {participant && (
            <span className="text-sm font-bold" style={{ color: '#6204BF' }}>{participant.score} pts</span>
          )}
        </div>

        {/* Pregunta */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
          <p className="text-base font-bold text-gray-900 leading-snug">{currentQuestion.text}</p>
        </div>

        {/* Opciones */}
        {myAnswer ? (
          // Ya respondió — muestra su respuesta seleccionada, esperando resultados
          <div className="flex-1 space-y-3">
            {(['a', 'b', 'c', 'd'] as const).map(opt => {
              const color = OPTION_COLORS[opt]
              const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
              const isSelected = myAnswer === opt
              return (
                <div
                  key={opt}
                  className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${
                    isSelected ? 'border-transparent text-white' : 'bg-white border-gray-200 text-gray-400'
                  }`}
                  style={isSelected ? { background: color.bg } : {}}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {color.label}
                  </div>
                  <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>{optText}</span>
                  {isSelected && <span className="ml-auto text-white/80 text-xs">Tu respuesta</span>}
                </div>
              )
            })}

            <div className="text-center mt-6">
              <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                Esperando resultados...
              </div>
            </div>
          </div>
        ) : (
          // Puede responder
          <div className="flex-1 space-y-3">
            {(['a', 'b', 'c', 'd'] as const).map(opt => {
              const color = OPTION_COLORS[opt]
              const optText = (currentQuestion as unknown as Record<string, string>)[`option_${opt}`]
              return (
                <button
                  key={opt}
                  onClick={() => submitAnswer(opt)}
                  disabled={submitting}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-white font-medium text-left transition-opacity disabled:opacity-70 active:scale-95"
                  style={{ background: color.bg }}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-sm flex-shrink-0">
                    {color.label}
                  </div>
                  <span>{optText}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return null
}
