import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ErrorApi } from './api/cliente'
import { Armazon } from './componentes/Armazon'
import './index.css'
import { CreditoDetalle } from './paginas/CreditoDetalle'
import { CreditoNuevo } from './paginas/CreditoNuevo'
import { Listado } from './paginas/Listado'
import { Login } from './paginas/Login'
import { Tablero } from './paginas/Tablero'
import { Usuarios } from './paginas/Usuarios'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Reintentar un 4xx solo repite el mismo error: la petición está mal, no la red.
      retry: (intentos, error) =>
        error instanceof ErrorApi && error.estado < 500 ? false : intentos < 2,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Todo lo que cuelga del armazón exige sesión: la guardia vive ahí. */}
          <Route element={<Armazon />}>
            <Route index element={<Tablero />} />
            <Route path="creditos" element={<Listado />} />
            <Route path="creditos/nuevo" element={<CreditoNuevo />} />
            <Route path="creditos/:id" element={<CreditoDetalle />} />
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
