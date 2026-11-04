export async function inspectHttpsTarget([name, url, expected], transport = fetch) {
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
      throw Error('HTTPS obrigatório sem credenciais na URL');
    }
    const response = await transport(endpoint.href, {
      redirect: 'manual', signal: AbortSignal.timeout(10_000)
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    const redirect = response.status >= 300 && response.status < 400;
    const sameOrigin = !redirect || !!location && new URL(location, endpoint).origin === endpoint.origin;
    return { name, status: response.status, expected, ok: expected.includes(response.status) && sameOrigin,
      ...(!sameOrigin ? { error: 'Redirecionamento externo ou sem destino' } : {}) };
  } catch (error) {
    return { name, ok: false, error: error.cause?.code || error.name };
  }
}
