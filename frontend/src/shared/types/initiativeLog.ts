export interface InitiativeLogEntry {
  id: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  eventType: string;
  field: string;
  previousValue: unknown;
  nextValue: unknown;
  actorAccountId: string | null;
  actorName: string | null;
  createdAt: string;
  read: boolean;
}
