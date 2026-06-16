// src/core/notify.prefs.js
// PER-MEMBER NOTIFICATION PREFERENCES (#7 — async comms). A member chooses which
// channels reach them and which kinds to mute. Store-backed, so preferences are
// durable + cluster-wide (the same shared store as workflows/quotas). When Hermes
// sends to a SPECIFIC member (audience = a member id), the orchestrator consults
// these to filter channels and drop muted kinds — steward/operational broadcasts
// are unaffected.

import { CHANNELS, KINDS } from './notify.shared.js';

const KEY = (memberId) => `notifypref:${memberId}`;
const DEFAULT = { channels: ['dashboard'], mutedKinds: [], digest: false };

export function createNotifyPrefs(store) {
  if (!store) throw new Error('createNotifyPrefs needs a state store');
  return {
    async get(memberId) { return { ...DEFAULT, ...((await store.get(KEY(memberId))) || {}) }; },

    // Validate + persist a member's preferences (partial update merges over current).
    async set(memberId, patch = {}) {
      const cur = await this.get(memberId);
      const next = { ...cur };
      if (patch.channels !== undefined) {
        const chans = [...new Set(['dashboard', ...patch.channels])];   // dashboard always on (the in-app surface)
        for (const c of chans) if (!CHANNELS.includes(c)) throw new Error(`unknown channel '${c}'`);
        next.channels = chans;
      }
      if (patch.mutedKinds !== undefined) {
        for (const k of patch.mutedKinds) if (!KINDS.includes(k)) throw new Error(`unknown kind '${k}'`);
        next.mutedKinds = [...new Set(patch.mutedKinds)];
      }
      if (patch.digest !== undefined) next.digest = !!patch.digest;
      await store.set(KEY(memberId), next);
      return next;
    },

    // Resolve the channels a member-targeted message should use given prefs, or
    // null if the kind is muted (caller drops it). Dashboard always stays.
    async resolve(memberId, kind, requestedChannels = null) {
      const p = await this.get(memberId);
      if (p.mutedKinds.includes(kind)) return { muted: true, channels: ['dashboard'] };
      const base = requestedChannels && requestedChannels.length ? requestedChannels : p.channels;
      const channels = [...new Set(['dashboard', ...base.filter((c) => p.channels.includes(c) || c === 'dashboard')])];
      return { muted: false, channels, digest: p.digest };
    },
  };
}
