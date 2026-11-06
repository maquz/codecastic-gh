export interface RequestConfig {
    params?: Record<string, any>;
    headers?: Record<string, string>;
}

async function request<T = any>(
    method: 'GET' | 'POST',
    url: string,
    bodyOrParams?: unknown,
    config?: RequestConfig
): Promise<{ data: T }> {
    let finalUrl = url;
    let requestBody: unknown = undefined;

    if (method === 'GET') {
        const rawParams =
            bodyOrParams && typeof bodyOrParams === 'object' && 'params' in (bodyOrParams as any)
                ? (bodyOrParams as any).params
                : bodyOrParams && typeof bodyOrParams === 'object'
                  ? bodyOrParams
                  : config?.params;

        if (rawParams && typeof rawParams === 'object') {
            const sp = new URLSearchParams();
            for (const [k, v] of Object.entries(rawParams)) {
                if (v !== undefined && v !== null) {
                    sp.append(k, String(v));
                }
            }
            const qs = sp.toString();
            if (qs) {
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
            }
        }
    } else {
        requestBody = bodyOrParams;
    }

    const res = await fetch(finalUrl, {
        method,
        cache: 'no-store',
        headers: {
            ...(requestBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(config?.headers || {}),
        },
        body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const err: any = new Error(data?.error || `Request failed with status ${res.status}`);
        err.response = { status: res.status, data };
        throw err;
    }

    return { data: data as T };
}

export const api = {
    get: <T = any>(url: string, configOrParams?: RequestConfig | Record<string, any>) =>
        request<T>('GET', url, configOrParams),
    post: <T = any>(url: string, body?: unknown, config?: RequestConfig) =>
        request<T>('POST', url, body, config),
};
