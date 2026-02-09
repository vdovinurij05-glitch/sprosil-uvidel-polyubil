export type Gender = 'male' | 'female';
export type SessionStatus = 'lobby' | 'roster' | 'qa_rounds' | 'voting' | 'results' | 'closed';

export interface Player {
  userId: string;
  telegramId: number;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  gender: Gender;
}

export interface CurrentQuestion {
  id: string;
  text: string;
  authorId: string;
  round: number;
}

export interface AnswerItem {
  id: string;
  authorId: string;
  text: string;
}

export interface QuestionItem {
  id: string;
  text: string;
  authorId: string;
  round: number;
}

export interface FlatAnswerItem {
  questionId: string;
  authorId: string;
  text: string;
}

export interface FinalVoteItem {
  voterId: string;
  votedForId: string | null;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  currentRound: number;
  totalRounds: number;
  males: Player[];
  females: Player[];
  currentQuestion?: CurrentQuestion;
  answers?: AnswerItem[];
  questions?: QuestionItem[];
  allAnswers?: FlatAnswerItem[];
  finalVotes?: FinalVoteItem[];
  timeRemaining?: number;
}

export interface MatchResult {
  id: string;
  userA: {
    id: string;
    firstName: string;
    username: string | null;
    photoUrl: string | null;
    telegramId: number;
  };
  userB: {
    id: string;
    firstName: string;
    username: string | null;
    photoUrl: string | null;
    telegramId: number;
  };
  score: number;
}

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
  gender: Gender | null;
}
