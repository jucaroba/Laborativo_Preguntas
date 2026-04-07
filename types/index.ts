export type GameStatus = 'waiting' | 'active' | 'finished'
export type AnswerOption = 'a' | 'b' | 'c' | 'd'

export interface Game {
  id: string
  name: string
  status: GameStatus
  current_question_index: number // -1 = pantalla QR, 0+ = índice de pregunta
  show_results: boolean          // true = mostrar resultados en pantalla
  created_at: string
}

export interface Question {
  id: string
  game_id: string
  order_index: number
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: AnswerOption
  created_at: string
}

export interface Participant {
  id: string
  game_id: string
  name: string
  last_name: string
  score: number
  created_at: string
}

export interface Answer {
  id: string
  participant_id: string
  question_id: string
  game_id: string
  selected_option: AnswerOption
  is_correct: boolean
  answered_at: string
}

export interface AnswerWithParticipant extends Answer {
  participants: Pick<Participant, 'name' | 'last_name'>
}
