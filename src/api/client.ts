import { API_BASE_URL, APP_KEY } from './config';
import { getToken, setToken, clearToken } from '../../utils/token';
import { setAuthRole, setAuthEmail } from '../../utils/auth';
import { handleApiError } from './errorHandler';
import type { ApiError } from './errors';

/**
 * Marketplace-engine API client.
 *
 * Every request:
 *   - includes the configured X-App-Key header (engine rejects with 400 otherwise)
 *   - includes the Bearer token when one is stored
 *   - auto-unwraps the {data, message, errors} envelope returned by the engine,
 *     so call sites can keep treating responses as flat objects.
 *
 * Error handling:
 *   - 4xx/5xx responses flow through handleApiError() — the envelope's `errors`
 *     field is surfaced as `error.fields` for form-validation use.
 *   - Network errors surface as ApiError(type=NETWORK).
 */
async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (APP_KEY) {
    headers['X-App-Key'] = APP_KEY;
  }

  const token = await getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Unwrap the engine's standard {data, message, errors} envelope so the rest
 * of the app keeps treating responses as flat. If the response somehow lacks
 * the `data` key, pass through unchanged (defensive).
 */
function unwrapEnvelope(body: any): any {
  if (body && typeof body === 'object' && 'data' in body && 'message' in body) {
    return body.data;
  }
  return body;
}

/**
 * Build a friendly error from a non-ok response. The engine surfaces
 * field-level validation errors in `errors`, so we attach them to the
 * thrown ApiError as `fields` for the auth/forms layer to consume.
 */
async function buildHttpError(response: Response): Promise<ApiError> {
  let parsed: any = null;
  try {
    parsed = await response.json();
  } catch {
    // non-JSON 4xx/5xx — keep going with the status text only
  }
  const message = parsed?.message
    || `API Error: ${response.status} ${response.statusText}`;
  const err: any = new Error(message);
  err.fields = parsed?.errors ?? null;
  return await handleApiError(err, response.status);
}

/**
 * Construct a FormData body from a plain field map.
 *
 * Conversion rules:
 *   - `undefined` / `null` values are skipped entirely (so callers can pass
 *     optional fields without conditionally building the object).
 *   - Booleans serialise to "1" / "0" — Laravel's `boolean` validation rule
 *     rejects FormData's default "true" / "false" strings.
 *   - Arrays serialise as repeated `key[]` entries — Laravel's standard
 *     array-input convention (e.g. adventures[]=1, adventures[]=2).
 *   - File / Blob / everything else is appended as-is.
 *
 * Extracted so {@link postMultipart} and {@link postMultipartWithProgress}
 * agree on serialisation. Older callers that don't pass arrays are
 * unaffected.
 */
function buildFormData(fields: Record<string, any>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      fd.append(key, value ? '1' : '0');
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        fd.append(`${key}[]`, typeof item === 'boolean' ? (item ? '1' : '0') : (item as any));
      }
    } else {
      fd.append(key, value as any);
    }
  }
  return fd;
}

const api = {
  // ── core verbs ───────────────────────────────────────────────────────────

  async get(path: string): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: await getHeaders(),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  /**
   * Build headers for a multipart request — same auth headers as a JSON
   * call, but WITHOUT Content-Type, since the browser/fetch sets the right
   * multipart/form-data boundary automatically when given a FormData body.
   */
  async _multipartHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (APP_KEY) headers['X-App-Key'] = APP_KEY;
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  },

  /**
   * Send a multipart POST. Accepts a plain object of fields where File/Blob
   * values become file parts and everything else becomes a string field.
   * Used for "create item with photo" / similar uploads.
   *
   * Field serialisation rules live in {@link buildFormData} — notably array
   * values become Laravel-style `key[]` repeats, so callers can pass e.g.
   * `{ adventures: [1, 2] }` directly.
   */
  async postMultipart(path: string, fields: Record<string, any>): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: await this._multipartHeaders(),
        body: buildFormData(fields),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  /**
   * Send a multipart POST with upload-progress notifications.
   *
   * Why XHR and not fetch():
   *   The Fetch API spec does not expose upload progress in any current
   *   browser — there is no `request.upload.onprogress` analogue and the
   *   ReadableStream-on-Request workaround is not implemented anywhere
   *   that ships to users. XMLHttpRequest's `xhr.upload.onprogress` is
   *   still the only way to surface "X% uploaded" to the UI today.
   *
   * Otherwise mirrors {@link postMultipart}: same auth headers, same
   * envelope unwrap, same field-level error surfacing.
   *
   * @param onProgress invoked with an integer 0–100 as the upload streams.
   *   Only fires when the browser reports `lengthComputable` (≈ always for
   *   file uploads). Not invoked again after the upload completes — the
   *   server may still be processing the request when 100% is reached.
   */
  async postMultipartWithProgress(
    path: string,
    fields: Record<string, any>,
    onProgress?: (pct: number) => void,
  ): Promise<any> {
    const headers = await this._multipartHeaders();
    const url = `${API_BASE_URL}${path}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

      if (onProgress) {
        xhr.upload.onprogress = (e: ProgressEvent) => {
          if (e.lengthComputable && e.total > 0) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      // network-level failure (DNS, CORS, dropped TCP) — no HTTP status.
      xhr.onerror = () => {
        const err: any = new Error('Network request failed');
        handleApiError(err).then(reject, reject);
      };

      xhr.onload = () => {
        const status = xhr.status;
        let parsed: any = null;
        try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* non-JSON */ }

        if (status >= 200 && status < 300) {
          resolve(unwrapEnvelope(parsed));
          return;
        }
        const message = parsed?.message || `API Error: ${status} ${xhr.statusText}`;
        const err: any = new Error(message);
        err.fields = parsed?.errors ?? null;
        handleApiError(err, status).then(reject, reject);
      };

      xhr.send(buildFormData(fields));
    });
  },

  /**
   * Send a multipart PATCH. Laravel doesn't natively handle PUT/PATCH with
   * multipart bodies, so we POST + spoof the method via _method=PATCH.
   */
  async patchMultipart(path: string, fields: Record<string, any>): Promise<any> {
    return await this.postMultipart(path, { ...fields, _method: 'PATCH' });
  },

  async post(path: string, body: any): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  async patch(path: string, body: any): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: await getHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  async put(path: string, body: any): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  async delete(path: string): Promise<any> {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
      if (!response.ok) throw await buildHttpError(response);
      return unwrapEnvelope(await response.json());
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  // ── auth ────────────────────────────────────────────────────────────────

  async register(data: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role: 'parent' | 'restaurant' | 'driver' | 'kid';
    restaurant_name?: string;
    restaurant_cuisine?: string;
    restaurant_description?: string;
  }): Promise<any> {
    const result = await this.post('/auth/register', data);
    if (result?.token) {
      await setToken(result.token);
    }
    return result;
  },

  async login(credentials: { email: string; password: string }): Promise<any> {
    const result = await this.post('/auth/login', credentials);
    if (result?.token) {
      await setToken(result.token);
    }
    return result;
  },

  async logout(): Promise<void> {
    try {
      await this.post('/auth/logout', {});
    } finally {
      await clearToken();
    }
  },

  /** GET /api/me — current authenticated user. */
  async me(): Promise<any> {
    return await this.get('/me');
  },

  getToken,
  setToken,
  clearToken,

  // ── adventures ──────────────────────────────────────────────────────────

  /** Currently live adventure, or null. Engine returns `data: null` when none. */
  async getActiveAdventure(): Promise<any> {
    return await this.get('/adventures/active');
  },

  /** Kid-scoped map state. Engine returns {adventure, map_nodes}. */
  async getAdventureMap(adventureId: number): Promise<any> {
    return await this.get(`/adventures/${adventureId}/map`);
  },

  /**
   * Upload a proof file. Two-step flow:
   *   1. Upload via POST /proof-assets  →  { id, type, url, mime, size }
   *   2. Submit via POST /adventures/steps/{id}/submit  →  attaches proof to step
   *
   * Returns the legacy `{ asset_id, url }` shape so existing repositories
   * don't need to change. `asset_id` maps to the engine's `id`.
   */
  async uploadProof(file: File | Blob, type: 'photo' | 'video' | 'audio' = 'photo'): Promise<{
    asset_id: number;
    url: string;
  }> {
    const url = `${API_BASE_URL}/proof-assets`;
    const formData = new FormData();
    // RN's FormData polyfill is happy with raw File/Blob or {uri, name, type}.
    // Callers (e.g. ImagePicker) typically pass a Blob-shaped object.
    formData.append('file', file as any);
    formData.append('type', type);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (APP_KEY) headers['X-App-Key'] = APP_KEY;
      const token = await getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) throw await buildHttpError(response);
      const unwrapped = unwrapEnvelope(await response.json());
      return {
        asset_id: unwrapped.id,
        url: unwrapped.url,
      };
    } catch (error: any) {
      if (error.type) throw error;
      throw await handleApiError(error);
    }
  },

  /**
   * Submit a previously-uploaded proof to a step. Engine path is
   * /adventures/steps/{step}/submit with { proof_asset_id }.
   *
   * Response includes the completion + any newly unlocked steps + any
   * transmissions to surface — re-shaped to a single `transmission` field
   * (taking the first one) for backward-compat with the existing repo.
   */
  async submitProof(stepId: number, assetId: number): Promise<any> {
    const data = await this.post(`/adventures/steps/${stepId}/submit`, {
      proof_asset_id: assetId,
    });
    const c = data?.completion ?? {};
    return {
      id: c.id,
      stepId,
      assetId,
      status: c.status,
      submittedAt: c.submitted_at,
      proofUrl: c.proof_url,
      unlockedSteps: data?.unlocked_steps ?? [],
      transmission: (data?.transmissions && data.transmissions[0]) || null,
    };
  },

  /** Leaderboard. Engine: {adventure, leaderboard[]}. */
  async getLeaderboard(adventureId: number): Promise<any> {
    return await this.get(`/adventures/${adventureId}/leaderboard`);
  },

  /**
   * POST /api/adventures/{id}/start — kid joins an adventure.
   * Idempotent: backend uses firstOrCreate so re-calls return the same
   * enrollment row. Returns {adventure, map_nodes, enrollment}.
   */
  async startAdventure(adventureId: number, snackId?: string | null): Promise<any> {
    return await this.post(`/adventures/${adventureId}/start`, snackId ? { snack_id: snackId } : {});
  },

  /** POST /api/adventures/{id}/pause — active → paused. Returns {adventure, map_nodes, enrollment}. */
  async pauseAdventure(adventureId: number): Promise<any> {
    return await this.post(`/adventures/${adventureId}/pause`, {});
  },

  /** POST /api/adventures/{id}/resume — paused → active (auto-pauses any other active). */
  async resumeAdventure(adventureId: number): Promise<any> {
    return await this.post(`/adventures/${adventureId}/resume`, {});
  },

  /** POST /api/adventures/{id}/abandon — → abandoned (mission shows as Available again). */
  async abandonAdventure(adventureId: number): Promise<any> {
    return await this.post(`/adventures/${adventureId}/abandon`, {});
  },

  // ── path to power ───────────────────────────────────────────────────────

  /** GET /api/path-map — shared admin-placed snack map (every kid sees the same one). */
  async getPathMap(): Promise<any> {
    return await this.get('/path-map');
  },

  /** PUT /api/admin/path-map — admin saves the snack array. */
  async savePathMap(snacks: any[]): Promise<any> {
    return await this.put('/admin/path-map', { snacks });
  },

  /**
   * POST /api/admin/path-map/images — multipart upload, returns { url }.
   * Caller embeds the returned URL into a snack on the subsequent savePathMap.
   */
  async uploadPathMapImage(file: File | Blob | { uri: string; name?: string; type?: string }): Promise<{ url: string }> {
    return await this.postMultipart('/admin/path-map/images', { file });
  },

  // ── parent ──────────────────────────────────────────────────────────────

  async getKids(): Promise<any[]> {
    return await this.get('/parent/kids');
  },

  async getKidProgress(kidId: number): Promise<any> {
    return await this.get(`/parent/kids/${kidId}/progress`);
  },

  async getPendingCompletions(): Promise<any[]> {
    return await this.get('/parent/pending-completions');
  },

  async approveCompletion(id: number): Promise<any> {
    const data = await this.post(`/parent/completions/${id}/approve`, {});
    const c = data?.completion ?? {};
    return {
      id: c.id,
      status: 'approved' as const,
      approvedAt: c.reviewed_at,
      unlockedSteps: data?.unlocked_steps ?? [],
      transmissions: data?.transmissions ?? [],
      mapNodes: data?.map_nodes ?? [],
    };
  },

  async rejectCompletion(id: number, reason?: string): Promise<any> {
    const data = await this.post(`/parent/completions/${id}/reject`, reason ? { reason } : {});
    const c = data?.completion ?? {};
    return {
      id: c.id,
      status: 'rejected' as const,
      rejectedAt: c.reviewed_at,
    };
  },

  /**
   * POST /api/parent/invite-codes
   * Generates a one-time invite code for the parent to hand to a kid.
   * If kidId is provided, the code re-issues for an already-linked kid
   * (and any prior active code for that kid is revoked).
   */
  async generateInviteCode(
    kidName: string,
    kidId?: number,
  ): Promise<{ code: string; kid_name: string; kid_id: number | null; expires_at: string; created_at?: string }> {
    return await this.post('/parent/invite-codes', kidId
      ? { kid_id: kidId, kid_name: kidName }
      : { kid_name: kidName });
  },

  /**
   * GET /api/parent/invite-codes
   * Returns all active (unexpired, unclaimed) kid codes for this parent.
   */
  async listInviteCodes(): Promise<Array<{ code: string; kid_name: string; kid_id: number | null; expires_at: string; created_at?: string }>> {
    const data = await this.get('/parent/invite-codes');
    return Array.isArray(data) ? data : (data?.data ?? []);
  },

  /**
   * DELETE /api/parent/invite-codes/{code}
   * Revokes a code (sets expires_at to now). 404 if not the parent's code.
   */
  async revokeInviteCode(code: string): Promise<void> {
    await this.delete(`/parent/invite-codes/${encodeURIComponent(code)}`);
  },

  /**
   * POST /api/kid/claim-invite (public — no auth token required)
   * Kid enters the code once; gets back a permanent Sanctum token.
   * Stores the token automatically so subsequent calls are authenticated.
   * Returns { token, kid: { id, name }, roles }.
   */
  async claimInviteCode(code: string): Promise<{ token: string; kid: { id: number; name: string }; roles: string[] }> {
    const result = await this.post('/kid/claim-invite', { code });
    if (result?.token) {
      await setToken(result.token);
      // Persist the kid's role so subsequent /me calls resolve to 'kid'
      // even if a stale parent-session role is sitting in local storage
      // (same-browser parent + kid SPA), and so the role survives if /me
      // ever stops returning a roles array.
      await setAuthRole('kid');
      // Clear any cached parent email — /me will repopulate it for the kid.
      await setAuthEmail(null);
    }
    return result;
  },
};

export default api;
