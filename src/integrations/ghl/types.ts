// ---------------------------------------------------------------------------
// Raw GHL DTOs - confirmed live (Aug 2026) against
// GET /opportunities/pipelines and GET /opportunities/search for the
// Dualiving location. Fields not used by the sync are still typed where they
// were present in the live response, in case they're needed later; anything
// commented as "not confirmed" wasn't observed in a live response.
//
// Two fields were deliberately NOT resolved to something more readable
// because the PIT's current scope returned 401 for the endpoints needed to
// do so honestly: `assignedTo` is a GHL user id (resolving to a name needs
// the Users API, which needs a broader scope), and the `customFields`
// entries are keyed by opaque field ids (resolving field names needs the
// location custom-fields API, same scope problem). Both stay in `raw` rather
// than being guessed at.
// ---------------------------------------------------------------------------

export interface GhlPipelineStage {
  id: string;
  name: string;
  position: number;
  stageWinProbability: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  locationId: string;
  stages: GhlPipelineStage[];
}

export interface GhlPipelinesResponse {
  pipelines: GhlPipeline[];
}

export interface GhlOpportunityContact {
  id: string;
  name: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  tags?: string[];
}

export interface GhlOpportunity {
  id: string;
  name: string;
  monetaryValue: number;
  pipelineId: string;
  pipelineStageId: string;
  assignedTo?: string;
  status: string; // confirmed: "open", "lost" - GHL docs also list "won", "abandoned"
  source: string | null;
  createdAt: string;
  updatedAt: string;
  forecastExpectedCloseDate?: string; // "YYYY-MM-DD", absent on some (e.g. lost) opportunities
  effectiveProbability?: number; // 0-100, the actual stage-derived win probability
  contactId: string;
  contact?: GhlOpportunityContact;
  customFields?: unknown[];
}

export interface GhlOpportunitySearchMeta {
  total: number;
  currentPage?: number;
  nextPage?: number | null;
  startAfter?: number;
  startAfterId?: string;
}

export interface GhlOpportunitySearchResponse {
  opportunities: GhlOpportunity[];
  meta: GhlOpportunitySearchMeta;
}
