export interface ChatObservation { guessing: boolean; confidence: number }
export function decideModeration(observation: ChatObservation | null, policy: { autoDelete: boolean } = { autoDelete: false }): 'flag' | 'delete' | 'none' {
  if (!observation?.guessing || !Number.isFinite(observation.confidence) || observation.confidence < .8 || observation.confidence > 1) return 'none';
  return policy.autoDelete ? 'delete' : 'flag';
}
