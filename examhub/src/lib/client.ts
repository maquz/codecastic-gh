async function request<T = any>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<{ data: T }> {
    const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
    get: <T = any>(url: string) => request<T>('GET', url),
    post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body),
};
