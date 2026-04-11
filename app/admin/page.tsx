'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Game, Question } from '@/types'
import { Plus, Trash2, ExternalLink, ChevronUp, ChevronDown, Edit2, Check, X } from 'lucide-react'

const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' }

export default function AdminPage() {
  const [games, setGames] = useState<Game[]>([])
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const editFormRef = useRef<HTMLDivElement>(null)
  const [newGameName, setNewGameName] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingQ, setEditingQ] = useState<Partial<Question> | null>(null)
  const [isNewQ, setIsNewQ] = useState(false)
  const [editingGameName, setEditingGameName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    loadGames()
  }, [])

  useEffect(() => {
    if (selectedGame) loadQuestions(selectedGame.id)
  }, [selectedGame])

  useEffect(() => {
    if (editingQ) {
      editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [editingQ])

  async function loadGames() {
    const { data } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setGames(data)
  }

  async function loadQuestions(gameId: string) {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameId)
      .order('order_index')
    if (data) setQuestions(data)
  }

  async function createGame() {
    if (!newGameName.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('games')
      .insert({ name: newGameName.trim(), status: 'waiting', current_question_index: -1, show_results: false })
      .select()
      .single()
    if (data) {
      setGames([data, ...games])
      setSelectedGame(data)
      setNewGameName('')
    }
    setLoading(false)
  }

  async function deleteGame(id: string) {
    if (!confirm('¿Eliminar este juego y todas sus preguntas?')) return
    await supabase.from('games').delete().eq('id', id)
    setGames(games.filter(g => g.id !== id))
    if (selectedGame?.id === id) {
      setSelectedGame(null)
      setQuestions([])
    }
  }

  async function resetGame(game: Game) {
    if (!confirm('¿Reiniciar el juego? Esto borrará todas las respuestas y puntajes.')) return
    await supabase.from('answers').delete().eq('game_id', game.id)
    await supabase.from('participants').delete().eq('game_id', game.id)
    const { data } = await supabase
      .from('games')
      .update({ status: 'waiting', current_question_index: -1, show_results: false })
      .eq('id', game.id)
      .select()
      .single()
    if (data) {
      setGames(games.map(g => g.id === data.id ? data : g))
      setSelectedGame(data)
    }
  }

  async function saveQuestion() {
    if (!editingQ || !selectedGame) return
    if (!editingQ.text || !editingQ.option_a || !editingQ.option_b || !editingQ.option_c || !editingQ.option_d || !editingQ.correct_answer) {
      alert('Completa todos los campos')
      return
    }
    if (isNewQ) {
      const maxOrder = questions.reduce((max, q) => Math.max(max, q.order_index), -1)
      const { data } = await supabase
        .from('questions')
        .insert({ ...editingQ, game_id: selectedGame.id, order_index: maxOrder + 1 })
        .select()
        .single()
      if (data) setQuestions([...questions, data])
    } else {
      const { text, option_a, option_b, option_c, option_d, correct_answer } = editingQ
      const { data } = await supabase
        .from('questions')
        .update({ text, option_a, option_b, option_c, option_d, correct_answer })
        .eq('id', editingQ.id)
        .select()
        .single()
      if (data) setQuestions(questions.map(q => q.id === data.id ? data : q))
    }
    setEditingQ(null)
    setIsNewQ(false)
  }

  async function deleteQuestion(id: string) {
    await supabase.from('questions').delete().eq('id', id)
    const remaining = questions.filter(q => q.id !== id)
    // reorder
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('questions').update({ order_index: i }).eq('id', remaining[i].id)
      remaining[i] = { ...remaining[i], order_index: i }
    }
    setQuestions(remaining)
  }

  async function saveGameName() {
    if (!selectedGame || !nameInput.trim()) return
    const { data } = await supabase.from('games').update({ name: nameInput.trim() }).eq('id', selectedGame.id).select().single()
    if (data) {
      setGames(games.map(g => g.id === data.id ? data : g))
      setSelectedGame(data)
    }
    setEditingGameName(false)
  }

  async function saveGameColor(color: string) {
    if (!selectedGame) return
    const { data } = await supabase.from('games').update({ color }).eq('id', selectedGame.id).select().single()
    if (data) {
      setGames(games.map(g => g.id === data.id ? data : g))
      setSelectedGame(data)
    }
  }

  async function moveQuestion(index: number, direction: 'up' | 'down') {
    const newQ = [...questions]
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newQ.length) return
    ;[newQ[index], newQ[swapIdx]] = [newQ[swapIdx], newQ[index]]
    newQ[index] = { ...newQ[index], order_index: index }
    newQ[swapIdx] = { ...newQ[swapIdx], order_index: swapIdx }
    setQuestions(newQ)
    await supabase.from('questions').update({ order_index: index }).eq('id', newQ[index].id)
    await supabase.from('questions').update({ order_index: swapIdx }).eq('id', newQ[swapIdx].id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="px-6 py-3 flex items-center gap-3" style={{ background: '#6204BF' }}>
        <img src="/logo-blanco.png" alt="Laborativo" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.1rem', fontWeight: 300 }}>/</span>
        <span style={{ color: '#fff', fontSize: '0.92rem', fontWeight: 600, letterSpacing: '0.01em' }}>Preguntas · Admin</span>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar — lista de juegos */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Nuevo juego</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#6204BF' } as React.CSSProperties}
                placeholder="Nombre del juego"
                value={newGameName}
                onChange={e => setNewGameName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createGame()}
              />
              <button
                onClick={createGame}
                disabled={loading || !newGameName.trim()}
                className="px-3 py-2 rounded-lg bg-white text-sm font-medium border border-[#6204BF] text-[#6204BF]"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {games.map(game => (
              <div
                key={game.id}
                onClick={() => setSelectedGame(game)}
                className={`group flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                  selectedGame?.id === game.id
                    ? 'text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                style={selectedGame?.id === game.id ? { background: '#6204BF' } : {}}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{game.name}</p>
                  <p className={`text-xs mt-0.5 ${selectedGame?.id === game.id ? 'text-purple-200' : 'text-gray-400'}`}>
                    {game.status === 'waiting' ? 'Esperando' : game.status === 'active' ? 'En curso' : 'Finalizado'}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteGame(game.id) }}
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded ${
                    selectedGame?.id === game.id ? 'text-purple-200 hover:text-white' : 'text-gray-400 hover:text-red-500'
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {games.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No hay juegos aún</p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {!selectedGame ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-400 text-lg">Selecciona o crea un juego</p>
              </div>
            </div>
          ) : (
            <div className="p-6 max-w-3xl mx-auto">
              {/* Game header */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-4">
                    {editingGameName ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          className="text-xl font-bold text-gray-900 border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 flex-1"
                          value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveGameName(); if (e.key === 'Escape') setEditingGameName(false) }}
                          autoFocus
                        />
                        <button onClick={saveGameName} className="p-1.5 rounded-lg bg-green-100 text-green-700"><Check size={14} /></button>
                        <button onClick={() => setEditingGameName(false)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-xl font-bold text-gray-900">{selectedGame.name}</h2>
                        <button onClick={() => { setNameInput(selectedGame.name); setEditingGameName(true) }} className="p-1 rounded text-gray-400 hover:text-gray-700">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-gray-500">
                        Estado: <span className="font-medium">
                          {selectedGame.status === 'waiting' ? 'Esperando' : selectedGame.status === 'active' ? 'En curso' : 'Finalizado'}
                        </span>
                        {' · '}
                        {questions.length} preguntas
                        {' · '}
                        Color:
                      </p>
                      <label className="relative w-5 h-5 rounded-md cursor-pointer overflow-hidden block flex-shrink-0" style={{ background: selectedGame.color || '#6204BF' }} title="Color del juego">
                        <input
                          type="color"
                          value={selectedGame.color || '#6204BF'}
                          onChange={e => setSelectedGame({ ...selectedGame, color: e.target.value })}
                          onBlur={e => saveGameColor(e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resetGame(selectedGame)}
                      className="px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50"
                    >
                      Reiniciar
                    </button>
                  </div>
                </div>

                {/* Links útiles */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <a
                    href={`/join/${selectedGame.id}`}
                    target="_blank"
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ExternalLink size={16} />
                    <span className="text-xs font-medium">Registro</span>
                  </a>
                  <a
                    href={`/screen?gameId=${selectedGame.id}`}
                    target="_blank"
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ExternalLink size={16} />
                    <span className="text-xs font-medium">QR / Pantalla</span>
                  </a>
                  <a
                    href={`/backstage?gameId=${selectedGame.id}`}
                    target="_blank"
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ExternalLink size={16} />
                    <span className="text-xs font-medium">Consola</span>
                  </a>
                </div>
              </div>

              {/* Questions */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Preguntas</h3>
                <button
                  onClick={() => { setEditingQ({ correct_answer: 'a' }); setIsNewQ(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ background: '#6204BF' }}
                >
                  <Plus size={14} /> Agregar pregunta
                </button>
              </div>

              {/* Question list */}
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id}>
                    <div className={`bg-white border rounded-xl p-4 ${editingQ?.id === q.id ? 'border-purple-300' : 'border-gray-200'}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-0.5 pt-1">
                          <button onClick={() => moveQuestion(idx, 'up')} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
                            <ChevronUp size={16} />
                          </button>
                          <button onClick={() => moveQuestion(idx, 'down')} disabled={idx === questions.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
                            <ChevronDown size={16} />
                          </button>
                        </div>

                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: '#6204BF' }}>
                          {idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 mb-2">{q.text}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['a', 'b', 'c', 'd'] as const).map(opt => (
                              <div
                                key={opt}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                                  q.correct_answer === opt
                                    ? 'bg-green-50 text-green-700 font-semibold'
                                    : 'bg-gray-50 text-gray-600'
                                }`}
                              >
                                <span className="font-bold">{OPTION_LABELS[opt]}.</span>
                                <span className="truncate">{(q as unknown as Record<string, string>)[`option_${opt}`]}</span>
                                {q.correct_answer === opt && <Check size={12} className="flex-shrink-0 text-green-600" />}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingQ(q); setIsNewQ(false) }}
                            className={`p-1.5 rounded-lg ${editingQ?.id === q.id ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => deleteQuestion(q.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Edit form inline */}
                    {editingQ && !isNewQ && editingQ.id === q.id && (
                      <div ref={editFormRef} className="mt-2 bg-white border-2 rounded-xl p-5" style={{ borderColor: '#6204BF' }}>
                        <h4 className="font-semibold text-gray-900 mb-4">Editar pregunta</h4>

                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Pregunta</label>
                          <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                            rows={3}
                            value={editingQ.text || ''}
                            onChange={e => setEditingQ({ ...editingQ, text: e.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {(['a', 'b', 'c', 'd'] as const).map(opt => (
                            <div key={opt}>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Opción {OPTION_LABELS[opt]}</label>
                              <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                value={(editingQ as unknown as Record<string, string>)[`option_${opt}`] || ''}
                                onChange={e => setEditingQ({ ...editingQ, [`option_${opt}`]: e.target.value })}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="mb-5">
                          <label className="block text-xs font-semibold text-gray-500 mb-2">Respuesta correcta</label>
                          <div className="flex gap-2">
                            {(['a', 'b', 'c', 'd'] as const).map(opt => (
                              <button
                                key={opt}
                                onClick={() => setEditingQ({ ...editingQ, correct_answer: opt })}
                                className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                                  editingQ.correct_answer === opt
                                    ? 'text-white border-transparent'
                                    : 'text-gray-600 border-gray-200 hover:border-gray-300'
                                }`}
                                style={editingQ.correct_answer === opt ? { background: '#059669', borderColor: '#059669' } : {}}
                              >
                                {OPTION_LABELS[opt]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setEditingQ(null); setIsNewQ(false) }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            <X size={14} /> Cancelar
                          </button>
                          <button
                            onClick={saveQuestion}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                            style={{ background: '#059669' }}
                          >
                            <Check size={14} /> Guardar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* New question form — al final de la lista */}
                {editingQ && isNewQ && (
                  <div ref={editFormRef} className="bg-white border-2 rounded-xl p-5" style={{ borderColor: '#6204BF' }}>
                    <h4 className="font-semibold text-gray-900 mb-4">Nueva pregunta</h4>

                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Pregunta</label>
                      <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                        rows={3}
                        placeholder="Escribe la pregunta aquí..."
                        value={editingQ.text || ''}
                        onChange={e => setEditingQ({ ...editingQ, text: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {(['a', 'b', 'c', 'd'] as const).map(opt => (
                        <div key={opt}>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Opción {OPTION_LABELS[opt]}</label>
                          <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            placeholder={`Opción ${OPTION_LABELS[opt]}`}
                            value={(editingQ as unknown as Record<string, string>)[`option_${opt}`] || ''}
                            onChange={e => setEditingQ({ ...editingQ, [`option_${opt}`]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mb-5">
                      <label className="block text-xs font-semibold text-gray-500 mb-2">Respuesta correcta</label>
                      <div className="flex gap-2">
                        {(['a', 'b', 'c', 'd'] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={() => setEditingQ({ ...editingQ, correct_answer: opt })}
                            className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                              editingQ.correct_answer === opt
                                ? 'text-white border-transparent'
                                : 'text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                            style={editingQ.correct_answer === opt ? { background: '#059669', borderColor: '#059669' } : {}}
                          >
                            {OPTION_LABELS[opt]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setEditingQ(null); setIsNewQ(false) }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <X size={14} /> Cancelar
                      </button>
                      <button
                        onClick={saveQuestion}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                        style={{ background: '#059669' }}
                      >
                        <Check size={14} /> Guardar
                      </button>
                    </div>
                  </div>
                )}

                {questions.length === 0 && !editingQ && (
                  <div className="text-center py-12 text-gray-400">
                    <p>No hay preguntas. Agrega la primera.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
