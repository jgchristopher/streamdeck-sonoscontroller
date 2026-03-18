import { reactive } from "vue";
import type { BaseOperationResponse, Speaker, SpeakerResponse, OperationalStatusValue } from "@/types/speakers";
import type { SpeakerState } from "@/types/actions";

// Export the enum separately
export const OPERATIONAL_STATUS = {
  UNINITIALIZED: "UNINITIALIZED",
  UPDATING: "UPDATING",
  UPDATED: "UPDATED",
  CONNECTED: "CONNECTED",
  CONNECTING: "CONNECTING",
  DISCONNECTED: "DISCONNECTED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

class SonosSpeakers {
  /**
   * Enumeration of possible operational statuses for speakers
   */
  static OPERATIONAL_STATUS = OPERATIONAL_STATUS;

  speakers: Record<string, Speaker>;
  validOperationalStatuses: OperationalStatusValue[];

  constructor() {
    this.speakers = reactive({}) as Record<string, Speaker>;
    this.validOperationalStatuses = Object.values(SonosSpeakers.OPERATIONAL_STATUS) as OperationalStatusValue[];
  }

  /**
   * Adds a new speaker with an empty contexts array and initial status of UNINITIALIZED.
   */
  addSpeaker({ UUID }: { UUID: string }): BaseOperationResponse {
    if (!this.speakers[UUID]) {
      this.speakers[UUID] = {
        contexts: [],
        operationalStatus: SonosSpeakers.OPERATIONAL_STATUS.UNINITIALIZED,
        state: {},
        updateAttempts: [],
        lastChecked: 0,
        lastUpdated: Math.floor(Date.now() / 1000),
      };
      return { status: "SUCCESS", message: "Speaker added", completed: true };
    }
    return {
      status: "ERROR",
      message: "Speaker already exists",
      completed: false,
    };
  }

  /**
   * Gets a speaker's information and status, including rate limiting checks.
   */
  getSpeaker({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const timeWindow = 10; // 10 second window
    const maxUpdates = 3; // Max updates allowed in window
    if (this.speakers[UUID].operationalStatus !== SonosSpeakers.OPERATIONAL_STATUS.UPDATED) {
      this.speakers[UUID].updateAttempts = this.speakers[UUID].updateAttempts.filter(
        (timestamp) => currentTime - timestamp < timeWindow,
      );

      // If too many update attempts and not already rate limited, set status to rate limited
      if (
        this.speakers[UUID].updateAttempts.length > maxUpdates &&
        this.speakers[UUID].operationalStatus !== SonosSpeakers.OPERATIONAL_STATUS.RATE_LIMITED
      ) {
        this.speakers[UUID].operationalStatus = SonosSpeakers.OPERATIONAL_STATUS.RATE_LIMITED;
      }
      // If currently rate limited but attempts have dropped below max, set back to disconnected
      else if (
        this.speakers[UUID].operationalStatus === SonosSpeakers.OPERATIONAL_STATUS.RATE_LIMITED &&
        this.speakers[UUID].updateAttempts.length < maxUpdates
      ) {
        this.speakers[UUID].operationalStatus = SonosSpeakers.OPERATIONAL_STATUS.DISCONNECTED;
      }
    }
    return {
      status: "SUCCESS",
      message: "Speaker info retrieved",
      completed: true,
      secondsLastChecked: currentTime - this.speakers[UUID].lastChecked,
      ...this.speakers[UUID],
    };
  }

  /**
   * Gets a speaker's state information.
   */
  getSpeakerState({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    return {
      status: "SUCCESS",
      message: "Speaker info retrieved",
      completed: true,
      state: this.speakers[UUID].state,
    };
  }

  /**
   * Gets a speaker's operational status.
   */
  getSpeakerOperationalStatus({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    return {
      status: "SUCCESS",
      message: "Speaker status retrieved",
      completed: true,
      operationalStatus: this.speakers[UUID].operationalStatus,
    };
  }

  /**
   * Updates a speaker's state and status. If updateLastChecked is true, also updates the lastChecked timestamp.
   */
  updateSpeakerState({
    UUID,
    state,
    updateLastChecked = false,
  }: {
    UUID: string;
    state: SpeakerState;
    updateLastChecked?: boolean;
  }): BaseOperationResponse {
    if (this.speakers[UUID]) {
      this.speakers[UUID].state = state;
      this.speakers[UUID].operationalStatus = SonosSpeakers.OPERATIONAL_STATUS.UPDATED;
      if (updateLastChecked) {
        this.speakers[UUID].lastChecked = Math.floor(Date.now() / 1000);
      }
      this.speakers[UUID].lastUpdated = Math.floor(Date.now() / 1000);
      return {
        status: "SUCCESS",
        message: "Speaker info updated",
        completed: true,
      };
    }
    return {
      status: "ERROR",
      message: "Speaker does not exist",
      completed: false,
    };
  }

  /**
   * Removes a speaker by its unique identifier.
   */
  removeSpeaker({ UUID }: { UUID: string }): BaseOperationResponse {
    if (this.speakers[UUID]) {
      delete this.speakers[UUID];
      return { status: "SUCCESS", message: "Speaker removed", completed: true };
    }
    return {
      status: "ERROR",
      message: "Speaker does not exist",
      completed: false,
    };
  }

  /**
   * Checks if a speaker exists.
   */
  containsSpeaker({ UUID }: { UUID: string }): boolean {
    return !!this.speakers[UUID];
  }

  /**
   * Adds a context to a speaker's contexts array, optionally creating the speaker if it doesn't exist.
   */
  addContext({
    UUID,
    context,
    createIfNotExists = false,
  }: {
    UUID: string;
    context: string;
    createIfNotExists?: boolean;
  }): BaseOperationResponse {
    // Check if the speaker exists or should be created
    if (!this.speakers[UUID]) {
      if (createIfNotExists) {
        this.addSpeaker({ UUID });
      } else {
        return {
          status: "ERROR",
          message: "Speaker does not exist and createIfNotExists is false",
          completed: false,
        };
      }
    }

    // Speaker is guaranteed to exist here: either it existed before or addSpeaker just created it
    const speaker = this.speakers[UUID]!;
    if (!speaker.contexts.includes(context)) {
      speaker.contexts.push(context);
      return { status: "SUCCESS", message: "Context added", completed: true };
    }

    return {
      status: "ERROR",
      message: "Context already exists",
      completed: false,
    };
  }

  /**
   * Removes a context from a speaker's contexts array and optionally deletes the speaker if no contexts remain.
   */
  removeContext({
    UUID,
    context,
    deleteIfLast = false,
  }: {
    UUID: string;
    context: string;
    deleteIfLast?: boolean;
  }): BaseOperationResponse {
    if (this.speakers[UUID]) {
      // Check if the context exists
      if (!this.speakers[UUID].contexts.includes(context)) {
        return {
          status: "ERROR",
          message: "Context does not exist",
          completed: false,
        };
      }

      // Remove the specified context
      const initialLength = this.speakers[UUID].contexts.length;
      this.speakers[UUID].contexts = this.speakers[UUID].contexts.filter((ctx) => ctx !== context);

      // Check if the context was removed
      const wasRemoved = this.speakers[UUID].contexts.length < initialLength;

      // Check if the contexts array is empty and remove the speaker if it is and deleteIfLast is true
      if (wasRemoved && deleteIfLast && this.speakers[UUID].contexts.length === 0) {
        delete this.speakers[UUID];
      }

      return {
        status: "SUCCESS",
        message: "Context removed",
        completed: wasRemoved,
      };
    }
    return {
      status: "ERROR",
      message: "Speaker does not exist",
      completed: false,
    };
  }

  /**
   * Moves a context from its current speaker to a new speaker.
   */
  moveContext({
    currentUUID,
    futureUUID,
    context,
    deleteIfLast = false,
    createIfNotExists = false,
  }: {
    currentUUID: string;
    futureUUID: string;
    context: string;
    deleteIfLast?: boolean;
    createIfNotExists?: boolean;
  }): BaseOperationResponse {
    if (this.containsContext({ UUID: currentUUID, context })) {
      // Remove context from the current speaker and add it to the new speaker
      const removed = this.removeContext({
        UUID: currentUUID,
        context,
        deleteIfLast,
      });
      if (removed.status === "ERROR") {
        return removed;
      }
      const added = this.addContext({
        UUID: futureUUID,
        context,
        createIfNotExists,
      });
      if (added.status === "ERROR") {
        return added;
      }
      return {
        status: "SUCCESS",
        message: "Context moved",
        completed: removed.completed && added.completed,
      };
    }
    return {
      status: "ERROR",
      message: "Context does not exist",
      completed: false,
    };
  }

  /**
   * Checks if a speaker has a specific context.
   */
  containsContext({ UUID, context }: { UUID: string; context: string }): boolean {
    return this.speakers[UUID]?.contexts.includes(context) || false;
  }

  /**
   * Gets a list of all available contexts from a specific speaker.
   */
  getContexts({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    return {
      status: "SUCCESS",
      message: "Contexts retrieved",
      completed: true,
      contexts: this.speakers[UUID].contexts,
    };
  }

  /**
   * Gets the UUID associated with a specific context.
   */
  getSpeakerByContext({ context }: { context: string }): SpeakerResponse {
    for (const UUID in this.speakers) {
      const speaker = this.speakers[UUID];
      if (speaker && speaker.contexts.includes(context)) {
        return {
          status: "SUCCESS",
          message: "Context found",
          completed: true,
          UUID,
        };
      }
    }
    return { status: "ERROR", message: "Context not found", completed: false };
  }

  /**
   * Gets the last checked timestamp of a speaker.
   */
  getLastChecked({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    return {
      status: "SUCCESS",
      message: "Last checked retrieved",
      completed: true,
      lastChecked: this.speakers[UUID].lastChecked,
    };
  }

  /**
   * Sets the operational status of a speaker.
   * Implements rate limiting by tracking update attempts within a time window.
   */
  setOperationalStatus({
    UUID,
    operationalStatus,
  }: {
    UUID: string;
    operationalStatus: OperationalStatusValue;
  }): BaseOperationResponse {
    if (!this.speakers[UUID] || !this.validOperationalStatuses.includes(operationalStatus)) {
      return {
        status: "ERROR",
        message: "Invalid operational status",
        completed: false,
      };
    }

    const now = Math.floor(Date.now() / 1000);

    // Initialize update tracking if not exists
    if (!this.speakers[UUID].updateAttempts || operationalStatus === SonosSpeakers.OPERATIONAL_STATUS.UPDATED) {
      this.speakers[UUID].updateAttempts = [];
    }

    if (operationalStatus === SonosSpeakers.OPERATIONAL_STATUS.UPDATING) {
      this.speakers[UUID].updateAttempts.push(now);
    }

    this.speakers[UUID].lastUpdated = Math.floor(Date.now() / 1000);
    return {
      status: "SUCCESS",
      message: "Operational status set",
      completed: true,
    };
  }

  /**
   * Gets the number of seconds since a speaker was last checked.
   */
  secondsLastChecked({ UUID }: { UUID: string }): SpeakerResponse {
    if (!this.speakers[UUID]) {
      return {
        status: "ERROR",
        message: "Speaker does not exist",
        completed: false,
      };
    }
    const currentTime = Math.floor(Date.now() / 1000);
    return {
      status: "SUCCESS",
      message: "Seconds since checked retrieved",
      completed: true,
      secondsLastChecked: currentTime - this.speakers[UUID].lastChecked,
    };
  }

  /**
   * Gets a list of all speaker keys.
   */
  getAllSpeakers(): SpeakerResponse {
    return {
      status: "SUCCESS",
      message: "All speakers retrieved",
      completed: true,
      UUIDs: Object.keys(this.speakers),
    };
  }

  /**
   * Gets a list of all available contexts from all speakers.
   */
  getAllContexts(): SpeakerResponse {
    const allContexts = new Set<string>();
    for (const UUID in this.speakers) {
      const speaker = this.speakers[UUID];
      if (speaker) {
        speaker.contexts.forEach((context) => allContexts.add(context));
      }
    }
    return {
      status: "SUCCESS",
      message: "All contexts retrieved",
      completed: true,
      contexts: Array.from(allContexts),
    };
  }
}

export default SonosSpeakers;
