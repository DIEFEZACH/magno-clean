import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const siteUrl=(env.VITE_SITE_URL||'http://localhost:5173').replace(/\/$/,'');
  return {plugins:[react(),tailwindcss(),{name:'magno-clean-html-metadata',transformIndexHtml(html){return html.replaceAll('__MAGNO_SITE_URL__',siteUrl)}}]};
})
