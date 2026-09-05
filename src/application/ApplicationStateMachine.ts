export type ApplicationFlowState =
  | { stage: "INITIAL" }
  | { stage: "PAGE_OPENED"; vacancyId: string }
  | { stage: "AUTH_CHECKED"; vacancyId: string }
  | { stage: "VACANCY_CLASSIFIED"; vacancyId: string }
  | { stage: "APPLICATION_ENTRY"; vacancyId: string }
  | { stage: "APPLICATION_FORM"; vacancyId: string }
  | { stage: "READY"; vacancyId: string }
  | { stage: "SUBMITTING"; vacancyId: string }
  | { stage: "SUBMITTED"; vacancyId: string }
  | { stage: "TERMINAL"; vacancyId?: string; reason: string };

const allowedTransitions: Record<ApplicationFlowState["stage"], ReadonlySet<ApplicationFlowState["stage"]>> = {
  INITIAL: new Set(["PAGE_OPENED", "TERMINAL"]),
  PAGE_OPENED: new Set(["AUTH_CHECKED", "TERMINAL"]),
  AUTH_CHECKED: new Set(["VACANCY_CLASSIFIED", "TERMINAL"]),
  VACANCY_CLASSIFIED: new Set(["APPLICATION_ENTRY", "TERMINAL"]),
  APPLICATION_ENTRY: new Set(["APPLICATION_FORM", "SUBMITTED", "TERMINAL"]),
  APPLICATION_FORM: new Set(["READY", "TERMINAL"]),
  READY: new Set(["SUBMITTING", "TERMINAL"]),
  SUBMITTING: new Set(["SUBMITTED", "TERMINAL"]),
  SUBMITTED: new Set(),
  TERMINAL: new Set(),
};

export class ApplicationStateMachine {
  #state: ApplicationFlowState = { stage: "INITIAL" };

  get state(): ApplicationFlowState {
    return this.#state;
  }

  transition(next: ApplicationFlowState): void {
    if (!allowedTransitions[this.#state.stage].has(next.stage)) {
      throw new Error(`Invalid application transition: ${this.#state.stage} -> ${next.stage}`);
    }
    this.#state = next;
  }
}
