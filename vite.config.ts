import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // As worktrees de `.claude/worktrees/` são checkouts de outras branches, com
    // o código e o node_modules delas. Sem este exclude, `npm test` na raiz roda
    // os testes daquelas branches junto com os desta — reprovando por trabalho
    // alheio e aprovando sem enxergar o próprio (BUG-19 / WAR-11).
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
