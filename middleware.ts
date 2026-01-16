import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const referer = req.headers.get('referer') || ''

  // SOLO permitimos acceso desde tu portal
  const allowed = referer.includes('portal.condinerolibre.com')

  if (!allowed) {
    return new NextResponse(
      'Acceso restringido. Usa CDL Portal.',
      { status: 403 }
    )
  }

  return NextResponse.next()
}

// Aplica a todo el sitio
export const config = {
  matcher: '/:path*',
}
