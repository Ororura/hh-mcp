import { describe, expect, it } from "vitest";
import { ApplicationStateMachine } from "../../src/application/ApplicationStateMachine.js";

describe("ApplicationStateMachine", () => {
  it("accepts the normal submit path", () => {
    const machine = new ApplicationStateMachine();
    machine.transition({ stage: "PAGE_OPENED", vacancyId: "1" });
    machine.transition({ stage: "AUTH_CHECKED", vacancyId: "1" });
    machine.transition({ stage: "VACANCY_CLASSIFIED", vacancyId: "1" });
    machine.transition({ stage: "APPLICATION_ENTRY", vacancyId: "1" });
    machine.transition({ stage: "APPLICATION_FORM", vacancyId: "1" });
    machine.transition({ stage: "READY", vacancyId: "1" });
    machine.transition({ stage: "SUBMITTING", vacancyId: "1" });
    machine.transition({ stage: "SUBMITTED", vacancyId: "1" });
    expect(machine.state.stage).toBe("SUBMITTED");
  });

  it("rejects invalid transitions", () => {
    const machine = new ApplicationStateMachine();
    expect(() => machine.transition({ stage: "SUBMITTED", vacancyId: "1" })).toThrow(
      "INITIAL -> SUBMITTED",
    );
  });
});
