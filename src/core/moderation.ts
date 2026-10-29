export interface ChatObservation { guessing: boolean; confidence: number }
export function decideModeration(observation: ChatObservation | null): 'delete' | 'none' {
  return observation?.guessing && Number.isFinite(observation.confidence) && observation.confidence >= .8 && observation.confidence <= 1 ? 'delete' : 'none';
}
